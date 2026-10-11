-- 2026-10-11: RLS fix found by the automated tests (tests/rls.test.js)
--
-- Problem: the appointment insert/update policies checked that YOU are in the circle,
-- but not that the person you assign as "responsible" is. A member could assign an
-- appointment to anyone with an account, including someone from another family.
--
-- Fix: a helper that checks a given user is in a given circle, used in WITH CHECK.
-- Safe to run more than once. Run it in the Supabase SQL Editor on your live project.

create or replace function is_user_in_circle(check_circle_id uuid, check_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.circle_members
    where circle_id = check_circle_id and user_id = check_user_id
  );
$$;

drop policy if exists "members add appointments" on appointments;
create policy "members add appointments" on appointments
  for insert with check (
    is_circle_member(circle_id)
    and added_by = auth.uid()
    and (responsible_user_id is null or is_user_in_circle(circle_id, responsible_user_id))
  );

drop policy if exists "members update appointments" on appointments;
create policy "members update appointments" on appointments
  for update
  using (is_circle_member(circle_id))
  with check (
    is_circle_member(circle_id)
    and (responsible_user_id is null or is_user_in_circle(circle_id, responsible_user_id))
  );
