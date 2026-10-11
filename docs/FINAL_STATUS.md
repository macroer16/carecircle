# FINAL_STATUS.md — CareCircle

> **Update 11 October 2026:** row-level security is now covered by **24 automated tests** (`npm test`, see `tests/rls.test.js`) that run the real schema in PostgreSQL with two families and Supabase-style sign-in. They found and fixed one gap (assigning an appointment to someone outside the circle). Run `supabase/migrations/2026-10-11-rls-fixes.sql` on the live project to apply the fix there. The app is deployed at https://carecircle-self.vercel.app. The manual two-account test below is still worth doing once against the live project.


**Full document set:** `RLS_TEST.md`, `DEPLOYMENT.md`, `PRIVACY_CHECKLIST.md`,
`COMPETITIVE_ANALYSIS.md`, `YC_ASSESSMENT.md`, `USER_TEST_PLAN.md` — each written
from real research/evidence gathered during this build, not templated filler.

Honest status using precise categories. "LIVE VERIFIED" is never used for something
only compiled or only run once against a live database for an unrelated change.

## BUILT (code exists, compiles, not yet tested against live evidence)
- Home screen: "Since you last checked" with meaningful per-item descriptions
- "Needs attention" (unassigned upcoming appointments)
- "Who's handling what" (responsibility grouping)
- Appointment responsibility assignment (`responsible_user_id`)
- Push notification reminder pipeline (subscriptions, Edge Function, service worker)
- Note editing/deletion (author-only)
- Password reset flow
- Account deletion with sole-owner protection

## LOCALLY VERIFIED (actually run and confirmed in this environment)
- Clean production build (`npm run build`) — confirmed multiple times, most recently
  as part of packaging this ZIP
- Service worker correctly compiles with real push-handling code (`self.addEventListener('push', ...)`
  confirmed present in build output)
- No leftover references to the pre-redesign color palette (grep-verified)

## LIVE VERIFIED (actually tested against the real deployed Supabase project)
- SQL schema execution — the owner ran `supabase-schema.sql` successfully in their
  live project ("Success. No rows returned")
- SECURITY DEFINER `search_path` hardening — the owner ran this SQL successfully
  live
- Signup, login, circle creation, medication/appointment/note CRUD — the owner has
  used these successfully against the live database
- **Correction from an earlier round:** "security hardening applied live" was
  previously described in a way that could be misread as "security fully
  verified." It is not. It means one specific SQL change succeeded — see RLS
  status below for what remains unverified.

## NOT LIVE VERIFIED (the actual current gap)
- **RLS cross-circle isolation** — never actually tested with two real accounts.
  See RLS_TEST.md for the exact procedure.
- **Live invitation flow** — invitation code has been reasoned through and is used
  in the running app, but the specific edge cases (expired, revoked, reused) have
  not been deliberately tested live.
- **Live account deletion** — Edge Function is written but not deployed; sole-owner
  protection logic has not been tested against a live database.
- **Live reminders** — VAPID keys, Edge Function deployment, and `pg_cron`
  scheduling have not been completed. The feature will not actually send
  notifications until this setup is done.
- **`responsible_user_id` column** — added to the schema file in this build but
  has NOT yet been applied to the owner's live database (a one-line `ALTER TABLE`
  — see DEPLOYMENT.md).

## DEPLOYED
- **Not deployed.** The application has only been run locally (`npm run dev`)
  against the live Supabase backend. No Vercel deployment has occurred.

## BLOCKED / HUMAN CHECKPOINT
- Live RLS test — requires two real accounts, only the owner can create these
- Vercel deployment — requires the owner's Vercel account
- Real device testing — requires an actual phone
- Real user testing — requires real families
- Reminder setup — requires the owner to generate their own VAPID keys and
  configure Supabase secrets (deliberately not reused from build-testing keys)
- Naming decision (CareCircle vs. CircleCare) — a business decision, not
  something to resolve in code

## KNOWN LIMITATIONS (not hidden)
- Reminder scheduling compares times in UTC; UK's shift to BST (+1hr) in summer
  will cause reminders to fire an hour later than intended until fixed with
  proper timezone handling
- Medications support one reminder time each in the current UI (schema supports
  multiple; UI does not yet expose this)
- No care handover screen (evaluated, not built — insufficient validation yet
  to justify it)
- No native iOS/Android apps (PWA only — a deliberate architectural choice, not
  a gap)

## OVERALL STATUS

# 🟠 FUNCTIONAL BUT NEEDS WORK

Not GREEN. The blocking items are exclusively live-environment and real-world
validation steps that require the owner directly — no further code work changes
this status.
