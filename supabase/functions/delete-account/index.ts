// supabase/functions/delete-account/index.ts
//
// WHY THIS EXISTS: the Supabase client SDK (anon key, used in the browser)
// cannot delete an auth user — that requires the service_role key, which must
// NEVER be sent to the browser. This Edge Function runs server-side, holds
// the service_role key as a secret, and only deletes the account belonging
// to whoever's access token is calling it — a user can delete their own
// account, never anyone else's.
//
// DEPLOY: from your project root, `supabase functions deploy delete-account`
// (requires the Supabase CLI and your own project linked — see README)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401 });
    }

    // Client scoped to the CALLER's token — used only to verify who they are.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });
    }

    // Admin client — service_role key, server-side only, never exposed to the browser.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // Real edge case, fixed rather than ignored: if this user is the sole
    // owner of a circle that still has OTHER members, deleting them would
    // orphan that circle — the other family members would lose the ability
    // to invite/remove people or delete the circle. Block deletion in that
    // case with a clear, actionable message instead of silently breaking
    // another family's circle.
    const { data: ownedCircles } = await adminClient
      .from('circle_members')
      .select('circle_id, care_circles(name)')
      .eq('user_id', userData.user.id)
      .eq('role', 'owner');

    for (const oc of ownedCircles || []) {
      const { count } = await adminClient
        .from('circle_members')
        .select('*', { count: 'exact', head: true })
        .eq('circle_id', oc.circle_id);
      if (count && count > 1) {
        return new Response(
          JSON.stringify({
            error: `You own "${oc.care_circles?.name}" with other members in it. Transfer ownership or remove the other members before deleting your account.`,
          }),
          { status: 400 }
        );
      }
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userData.user.id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Unexpected error' }), { status: 500 });
  }
});
