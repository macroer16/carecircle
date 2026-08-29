// supabase/functions/send-reminders/index.ts
//
// Checks every medication with reminder_times set, finds any that are due
// right now (within the current minute, in the server's UTC time — see the
// honest caveat in the README about timezone handling), and sends a real
// push notification to every member of that medication's circle who has
// subscribed.
//
// This function does the WORK. Actually triggering it on a schedule is a
// separate step — see "SCHEDULING" note at the bottom of this file.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

Deno.serve(async (req) => {
  try {
    // Only the scheduler (using the service role key) should call this —
    // it's not meant to be triggered by an individual user's browser.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '__none__')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    webpush.setVapidDetails(
      'mailto:no-reply@carecircle.app',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!
    );

    // Current time rounded to the minute, e.g. "08:00:00" — matches against
    // the reminder_times time[] column.
    const now = new Date();
    const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:00`;

    const { data: dueMeds, error: medsError } = await supabase
      .from('medications')
      .select('id, name, dosage, circle_id')
      .is('deleted_at', null)
      .contains('reminder_times', [currentTime]);

    if (medsError) throw medsError;
    if (!dueMeds || dueMeds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No reminders due this minute' }), { status: 200 });
    }

    let sentCount = 0;
    const errors: string[] = [];

    for (const med of dueMeds) {
      // Find every member of this medication's circle, then every push
      // subscription belonging to those members.
      const { data: members } = await supabase
        .from('circle_members')
        .select('user_id')
        .eq('circle_id', med.circle_id);

      const userIds = (members || []).map((m) => m.user_id);
      if (userIds.length === 0) continue;

      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth_key')
        .in('user_id', userIds);

      for (const sub of subs || []) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth_key },
            },
            JSON.stringify({
              title: `Reminder: ${med.name}`,
              body: med.dosage ? `${med.dosage}` : 'It\'s time.',
            })
          );
          sentCount++;
        } catch (err) {
          // A dead/expired subscription is normal and expected over time —
          // clean it up rather than let it silently fail forever.
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          } else {
            errors.push(`${med.name}: ${err.message}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({ sent: sentCount, errors }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

// ============================================================
// SCHEDULING — this function needs to actually run every minute for
// reminders to be timely. Supabase supports this via pg_cron + pg_net,
// entirely within your own project, no external service needed:
//
//   select cron.schedule(
//     'send-reminders-every-minute',
//     '* * * * *',
//     $$
//     select net.http_post(
//       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-reminders',
//       headers := jsonb_build_object('Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY')
//     );
//     $$
//   );
//
// Run this once in the SQL Editor after deploying the function (see README).
// ============================================================
