# DEPLOYMENT.md

## Step 0 — one outstanding database change

This build added appointment responsibility ("who's handling what"), which needs
one new column that hasn't been applied to your live database yet. Run this once
in your Supabase SQL Editor before anything else:

```sql
alter table appointments add column responsible_user_id uuid references public.user_profiles(id);
```

## Step 1 — Supabase (if not already done)
1. Run `supabase-schema.sql` in full (safe to re-run — uses `if not exists` /
   `or replace` patterns where relevant)
2. Note your Project URL and anon/publishable key (Settings → API)

## Step 2 — Local environment
```
cp .env.example .env
# fill in your real values
npm install
npm run dev
```

## Step 3 — Edge Functions
```
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy delete-account
supabase functions deploy send-reminders
```
Add secrets for `send-reminders` in the Supabase dashboard (Edge Functions →
send-reminders → Settings): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (generate
your own with `npx web-push generate-vapid-keys` — do not reuse any example keys
from earlier build/testing).

## Step 4 — Reminder scheduling
In the SQL Editor:
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

## Step 5 — Vercel
1. Push this code to a GitHub repository
2. Import into Vercel
3. Add environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_VAPID_PUBLIC_KEY`
4. Deploy

## Step 6 — Verify production
Visit your live URL. Sign up, create a circle, confirm the dashboard loads. Check
browser console for unexpected errors (distinguish real app errors from browser
extension noise — see README's console error note).

## Do this before Step 5, not after
Complete `RLS_TEST.md` locally against your live Supabase project first. There's
no reason to deploy an unverified security posture to a public URL.
