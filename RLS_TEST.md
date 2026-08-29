# RLS_TEST.md — The Live Two-Account Isolation Test

This is the single most important remaining verification step. Do not skip it.

## Setup
1. Open your app in a normal browser window. Sign up as **Account A**
   (e.g. `testA@youremail.com`). Create a circle, add a medication, an
   appointment, and a note.
2. Open a **private/incognito window** (separate session, required — a normal
   second tab shares Account A's login). Sign up as **Account B**
   (e.g. `testB@youremail.com`). Create a *different* circle with different data.

## Tests to run, as Account B, trying to see Account A's data

1. **Dashboard:** Does Account B's dashboard show only Account B's circle? ✅ expected
2. **Direct API attempt:** Open browser dev tools (F12) → Console. While logged in
   as Account B, try:
   ```js
   const { data, error } = await window.supabase
     .from('care_circles')
     .select('*');
   console.log(data);
   ```
   (You'll need to expose the client for this — or simpler: just check the Network
   tab while using the app normally and confirm every response only ever contains
   Account B's own `circle_id`.)
3. **Medications/appointments/notes:** Switch to each tab as Account B — confirm
   none of Account A's data appears anywhere.
4. **Family/members:** Confirm Account B cannot see Account A's circle members.
5. **Invitations:** As Account A, create an invitation. As Account B, do NOT use
   that link yet — confirm Account B cannot query or guess their way into Account
   A's circle without it.

## Expected result
**Zero cross-circle access, in every single test above.**

## If something fails
Screenshot exactly what Account B was able to see, and the exact steps that got
you there. This is a genuine security bug if it happens — stop and report it
rather than continuing to test other things.

## Only after this fully passes
Update `FINAL_STATUS.md`'s RLS line to **LIVE VERIFIED**, with today's date and
what was tested.
