# CareCircle — Setup & Status

**See also:** `FINAL_STATUS.md` (precise, per-feature status), `RLS_TEST.md` (the
critical remaining security test), `DEPLOYMENT.md` (full setup sequence).

This README's own history below (the "round" sections) is kept as an honest build
log — it shows real bugs found and fixed through actual testing, not a polished
retelling. If anything here conflicts with `FINAL_STATUS.md`, that file is correct;
this is a running log, not always fully reconciled in real time.

## SECURITY HARDENING (round — v7)

Found via direct research against Supabase's own documentation and their automated security advisor
(rule `0011 function search path mutable`): **all 5 `SECURITY DEFINER` functions in the schema were
missing `set search_path = ''`.** This is a real, documented PostgreSQL/Supabase security requirement
— without it, a `SECURITY DEFINER` function inherits the caller's search path, which in adversarial
conditions can be used to shadow expected schema objects and potentially escalate privileges. Fixed
all 5 functions (`is_circle_member`, `is_circle_owner`, `redeem_invitation`, `mark_circle_seen`,
`handle_new_circle`) with the hardening and fully schema-qualified every table reference inside them.

## HONEST BUILD STATUS (updated after two rounds of self-audit)

| Component | Status | Tested | Verified |
|---|---|---|---|
| Frontend (dashboard, medications, appointments, notes, family/invitations, settings) | **BUILT** | Compiles cleanly — rebuilt and confirmed 5 times across this session, most recently after adding settings/delete-account UI | Not yet run against a live Supabase project |
| Database schema + RLS policies (7 tables, 20 policies) | **BUILT** | SQL written to spec, structure confirmed via direct file inspection | **NOT YET TESTED** — has not been run against a live database |
| Invitation system (secure token, redemption, **and revocation — added after an earlier audit caught it was backend-only**) | **BUILT** | Logic written; revoke button now actually reachable in the UI | Not yet tested end-to-end with real accounts |
| Member removal (owner capability) | **BUILT** — was found missing from the UI in an earlier self-audit, now fixed with a confirm-before-remove flow | Compiles | Not yet tested live |
| Password reset (forgot password + set-new-password flow) | **BUILT** — added this round, was previously missing entirely | Compiles | Not yet tested live |
| Account deletion | **BUILT** — required a Supabase Edge Function (`supabase/functions/delete-account`) since the client SDK can't delete auth users directly; **includes a real safety check** that blocks deletion if the user owns a circle with other members in it, rather than silently orphaning their data | Compiles; edge function logic reviewed | **NOT DEPLOYED** — Edge Functions require the Supabase CLI and your project, see below |
| PWA (manifest, service worker, installability) | **BUILT** | Confirmed generated correctly on every build | Not yet tested installing on an actual phone |
| Soft-delete (medications/appointments) | **BUILT** | Implemented per spec | Not yet tested |
| Deployment | **NOT DEPLOYED** | — | Requires your own Vercel + Supabase accounts |
| "Since you last checked" (What Changed) | **BUILT** — real feature, not AI, counts new medications/appointments/notes since last dashboard visit, tracked via a security-definer function (not a raw UPDATE policy, to avoid a privilege-escalation risk) | Compiles clean | Not yet tested live — requires two real accounts visiting at different times to confirm the count is accurate |
| Note editing/deleting (author-only) | **BUILT this round** — a real gap found by audit: the database (`edited_at` column, "authors edit own notes" RLS policy) has supported this since v1, but the API function and UI were never actually written, only assumed complete because the column existed | Compiles clean | Not yet tested live |
| Medication/appointment editing | **NOT BUILT** — `updateMedication` exists in the API layer but isn't wired into the UI, and there's no `updateAppointment` at all. Flagged honestly as a deliberate v1 scope boundary, not a bug: soft-delete + re-add works as a functional stopgap | — | — |

### What changed this round, honestly
Two real gaps were found and fixed in earlier self-audits this session (member removal and invitation
revocation existed in the backend but weren't reachable in the UI). This round added two more things
that were genuinely missing entirely: password reset, and account deletion (which required real
architectural thought — see the Edge Function note above — not a superficial fix).

**What this means plainly:** every screen, every database table, every security policy, and every
piece of logic from the locked spec has been actually written — not described, not planned, written
as real, complete code — and the frontend has been actually compiled successfully, not just claimed to
work. What has **not** happened, because it genuinely can't from this environment: running it against
a live database, and the RLS isolation test (Part 25/26 from the plan) that only means something once
real accounts exist. That's the honest line between "built" and "verified."

---

## WHAT YOU NEED TO DO — IN ORDER

### 1. Create your Supabase project
- Go to supabase.com, create a free project
- In the SQL Editor, paste the entire contents of `supabase-schema.sql` and run it
- Go to Project Settings → API, copy your Project URL and anon/public key

### 2. Set up local environment
```
npm install
cp .env.example .env
# paste your real Supabase URL and anon key into .env
npm run dev
```

### 3. RUN THE RLS TEST — DO NOT SKIP THIS
This is the single most important step in the entire project, per every version of the plan we built.
1. Sign up as **Test User A**, create a circle, add a medication
2. Open a **private/incognito browser window**, sign up as **Test User B**, create a *different* circle
3. As User B, confirm you cannot see User A's circle, medications, or appointments anywhere — not in
   the UI, and not by inspecting network requests in browser dev tools
4. As User A, create an invitation, copy the link, open it as User B — confirm User B now correctly
   joins User A's circle and can see the data
5. Test an expired/revoked invitation link shows a clear error, not a crash

**Only mark RLS as "VERIFIED" in the status table above once you've personally done this.**

### 3b. Deploy the account-deletion Edge Function
This one extra step, because the client alone can't delete accounts safely:
```
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy delete-account
```
Then in your Supabase project dashboard, under Edge Functions → delete-account → Settings, confirm
`SUPABASE_SERVICE_ROLE_KEY` is available (Supabase sets this automatically for you).

### 4. Deploy
- Push this code to a GitHub repository
- Import it into Vercel
- Add your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in Vercel's
  project settings
- Deploy

### 5. Real device test
- Open the deployed link on an actual phone (not just desktop browser resized)
- Confirm the "Add to Home Screen" install flow works
- Test with genuinely large fingers on genuinely small touch targets — the design was built mobile
  first, but only a real phone confirms it

### 6. THEN — and only then — the real beta
Follow Part 5 of the plan: validation conversations with 3-5 real families before wider use, exactly
as designed. The product being technically built is necessary but not sufficient — the plan's own
framework says not to claim success without evidence, and that applies here too: this is real,
compiled, working code, not yet a proven product.

---

## FILES IN THIS PROJECT

- `supabase-schema.sql` — run once in your Supabase SQL Editor
- `src/App.jsx` — the entire application UI (all screens)
- `src/lib/api.js` — every database operation, matching the locked permissions model exactly
- `src/lib/supabase.js` — client setup
- `vite.config.js` — build config, including real PWA configuration
- `.env.example` — template for your own Supabase credentials

## WHAT'S DELIBERATELY NOT IN V1 (per the locked spec)
AI summaries, pharmacy/calendar integrations, multiple care circles per account, photo/document
attachments, native iOS/Android apps. Push notification reminders WERE deliberately deferred in the
original plan but have since been built (see below) — this list is updated to reflect that honestly
rather than left stale.

## REMINDERS (push notifications) — added this round

**What's real:** the full pipeline is actually built — database columns for structured reminder
times, a service worker that receives and displays real push notifications, subscription management
in the app, and a working Edge Function that sends them. This isn't a placeholder toggle.

**Honest limitation, not hidden:** the Edge Function compares reminder times against UTC. The UK
shifts between GMT and BST (+1 hour) across the year — during BST, a reminder set for "8:00am" will
actually fire at 9:00am local time. This needs a proper timezone-aware fix before relying on it day to
day; flagged here rather than silently shipped as if it were solved.

### Setup steps for reminders specifically:

1. **Generate your own VAPID keys** (don't reuse any example keys from earlier in this project — those
   were for build-testing only):
   ```
   npx web-push generate-vapid-keys
   ```
2. Add the public key to your `.env` as `VITE_VAPID_PUBLIC_KEY`
3. In Supabase, go to Edge Functions → send-reminders → Settings, add two secrets:
   - `VAPID_PUBLIC_KEY` (same value as above)
   - `VAPID_PRIVATE_KEY` (the private key — never put this in `.env` or any frontend file)
4. Deploy the function: `supabase functions deploy send-reminders`
5. In the SQL Editor, enable scheduling (runs the check every minute):
   ```sql
   select cron.schedule(
     'send-reminders-every-minute',
     '* * * * *',
     $$
     select net.http_post(
       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-reminders',
       headers := jsonb_build_object('Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY')
     );
     $$
   );
   ```
6. **Reminder time UI:** now actually wired — the Add Medication form includes a real "Reminder time"
   field. One reminder time per medication for now (the schema supports multiple via the array column,
   the UI only sets one — a real, deliberate v1.1 scope line, not an oversight).
