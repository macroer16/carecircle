-- CARECIRCLE — Production Database Schema
-- Run this in Supabase SQL Editor (your own project) once, top to bottom.
-- Status: BUILT. NOT YET TESTED against a live Supabase project (requires your own project — see README).

-- ============================================================
-- TABLES
-- ============================================================

create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz default now()
);

create table care_circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) not null,
  created_at timestamptz default now()
);

create table circle_members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references care_circles(id) on delete cascade not null,
  -- References user_profiles, not auth.users directly: the app asks PostgREST
  -- to fetch each member's display name in the same query (user_profiles(display_name)),
  -- which requires a direct foreign key between these two tables to auto-resolve —
  -- pointing at auth.users instead breaks that with a 400 error at query time.
  user_id uuid references public.user_profiles(id) on delete cascade not null,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  unique(circle_id, user_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references care_circles(id) on delete cascade not null,
  token text unique not null default encode(gen_random_bytes(24), 'hex'),
  created_by uuid references auth.users(id) not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now()
);

create table medications (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references care_circles(id) on delete cascade not null,
  name text not null,
  dosage text,
  schedule_text text,
  reminder_times time[], -- e.g. '{08:00, 20:00}' — structured times for actual push reminders,
                          -- separate from schedule_text which stays free-text for human-readable notes
  notes text,
  added_by uuid references auth.users(id) not null,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references care_circles(id) on delete cascade not null,
  date date not null,
  time time,
  doctor_name text,
  location text,
  notes text,
  -- Who's attending — powers "Who's handling what" and "Needs attention"
  -- (an upcoming appointment with nobody assigned) on the dashboard.
  -- References user_profiles for the same reason as circle_members.user_id.
  responsible_user_id uuid references public.user_profiles(id),
  added_by uuid references auth.users(id) not null,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create table care_notes (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references care_circles(id) on delete cascade not null,
  -- Same reasoning as circle_members.user_id above — needed for user_profiles(display_name) to embed.
  author_id uuid references public.user_profiles(id) not null,
  content text not null,
  created_at timestamptz default now(),
  edited_at timestamptz
);

-- Stores each device's Web Push subscription so reminders can actually be
-- delivered. One user can have multiple (phone + laptop, etc).
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz default now(),
  unique(user_id, endpoint)
);

-- ============================================================
-- INDEXES (every table filters by circle_id constantly — index it)
-- ============================================================

create index idx_circle_members_circle on circle_members(circle_id);
create index idx_circle_members_user on circle_members(user_id);
create index idx_medications_circle on medications(circle_id) where deleted_at is null;
create index idx_appointments_circle on appointments(circle_id) where deleted_at is null;
create index idx_care_notes_circle on care_notes(circle_id, created_at desc);
create index idx_invitations_token on invitations(token);

-- ============================================================
-- HELPER FUNCTION: is the current user a member of this circle?
-- (Used repeatedly in RLS policies below — defined once, security definer
--  to avoid recursive RLS lookups slowing every query down.)
-- ============================================================

create or replace function is_circle_member(check_circle_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.circle_members
    where circle_id = check_circle_id and user_id = auth.uid()
  );
$$;

create or replace function is_circle_owner(check_circle_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.circle_members
    where circle_id = check_circle_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ============================================================
-- ROW LEVEL SECURITY — this is the section that MUST be
-- personally tested by you before launch. See README Part "RLS TEST".
-- ============================================================

alter table user_profiles enable row level security;
alter table care_circles enable row level security;
alter table circle_members enable row level security;
alter table invitations enable row level security;
alter table medications enable row level security;
alter table appointments enable row level security;
alter table care_notes enable row level security;

-- user_profiles: everyone can read display names of people in their circles;
-- can only edit their own
create policy "profiles viewable by circle-mates" on user_profiles
  for select using (
    id = auth.uid() or
    exists (
      select 1 from circle_members cm1
      join circle_members cm2 on cm1.circle_id = cm2.circle_id
      where cm1.user_id = auth.uid() and cm2.user_id = user_profiles.id
    )
  );
create policy "users edit own profile" on user_profiles
  for update using (id = auth.uid());
create policy "users insert own profile" on user_profiles
  for insert with check (id = auth.uid());

-- care_circles: only members can see their circle; only owner can update/delete
create policy "members view their circles" on care_circles
  for select using (is_circle_member(id));
-- Separate policy for the creator specifically: closes a real timing gap where
-- the "add creator as owner" trigger (below) hasn't committed yet at the exact
-- moment PostgREST evaluates the RETURNING clause after insert — without this,
-- creating a circle succeeds but immediately fails to hand the result back.
create policy "creator views own circle" on care_circles
  for select using (created_by = auth.uid());
create policy "authenticated users create circles" on care_circles
  for insert with check (created_by = auth.uid());
create policy "owner updates circle" on care_circles
  for update using (is_circle_owner(id));
create policy "owner deletes circle" on care_circles
  for delete using (is_circle_owner(id));

-- circle_members: members can see who else is in their circle;
-- only owner can remove members; new members added via invitation redemption
-- (handled through a security-definer function below, not direct insert)
create policy "members view circle membership" on circle_members
  for select using (is_circle_member(circle_id));
create policy "owner removes members" on circle_members
  for delete using (is_circle_owner(circle_id) and role <> 'owner');

-- invitations: only circle owner can view/create/revoke invitations for their circle
create policy "owner manages invitations" on invitations
  for all using (is_circle_owner(circle_id));

-- medications: any circle member can view/add/edit; nobody can hard-delete
-- (soft delete only, enforced by app logic setting deleted_at, not a delete policy)
create policy "members view medications" on medications
  for select using (is_circle_member(circle_id));
create policy "members add medications" on medications
  for insert with check (is_circle_member(circle_id) and added_by = auth.uid());
create policy "members update medications" on medications
  for update using (is_circle_member(circle_id));

-- appointments: same pattern as medications
create policy "members view appointments" on appointments
  for select using (is_circle_member(circle_id));
create policy "members add appointments" on appointments
  for insert with check (is_circle_member(circle_id) and added_by = auth.uid());
create policy "members update appointments" on appointments
  for update using (is_circle_member(circle_id));

-- care_notes: any member views/adds; only the author can edit/delete their own note
create policy "members view notes" on care_notes
  for select using (is_circle_member(circle_id));
create policy "members add notes" on care_notes
  for insert with check (is_circle_member(circle_id) and author_id = auth.uid());
create policy "authors edit own notes" on care_notes
  for update using (author_id = auth.uid());
create policy "authors delete own notes" on care_notes
  for delete using (author_id = auth.uid());

-- push_subscriptions: every operation restricted to the owning user only —
-- nobody, including circle members, should see or manage another person's
-- device subscriptions.
alter table push_subscriptions enable row level security;
create policy "users manage own push subscriptions" on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- SECURE INVITATION REDEMPTION
-- A member should never be inserted into circle_members directly by the
-- client (that would let anyone add themselves to any circle). Instead,
-- redeeming an invitation goes through this function, which validates the
-- token server-side before granting membership.
-- ============================================================

create or replace function redeem_invitation(invite_token text)
returns uuid -- returns the circle_id on success
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_circle_id uuid;
  v_expires_at timestamptz;
  v_revoked_at timestamptz;
  v_used_at timestamptz;
begin
  select circle_id, expires_at, revoked_at, used_at
    into v_circle_id, v_expires_at, v_revoked_at, v_used_at
  from public.invitations
  where token = invite_token;

  if v_circle_id is null then
    raise exception 'Invalid invitation link.';
  end if;

  if v_revoked_at is not null then
    raise exception 'This invitation has been revoked.';
  end if;

  if v_expires_at < now() then
    raise exception 'This invitation has expired — ask for a new one.';
  end if;

  -- allow reuse by multiple invited family members up to expiry (not
  -- strictly one-time) — matches "invite the whole family with one link"
  -- being the simplest real-world flow; owner can revoke at any time.

  insert into public.circle_members (circle_id, user_id, role)
  values (v_circle_id, auth.uid(), 'member')
  on conflict (circle_id, user_id) do nothing;

  update public.invitations set used_at = now() where token = invite_token and used_at is null;

  return v_circle_id;
end;
$$;

-- ============================================================
-- AUTO-CREATE PROFILE + OWNER MEMBERSHIP ON SIGNUP / CIRCLE CREATION
-- ============================================================

create or replace function mark_circle_seen(target_circle_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.circle_members
  set last_seen_at = now()
  where circle_id = target_circle_id and user_id = auth.uid();
$$;
-- Deliberately a narrow function rather than a general UPDATE policy on
-- circle_members: a raw policy letting members update their own row would
-- also let them tamper with their own `role` column (privilege escalation).
-- This function can only ever touch last_seen_at, nothing else.

create or replace function handle_new_circle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.circle_members (circle_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_circle_created
  after insert on care_circles
  for each row execute function handle_new_circle();
