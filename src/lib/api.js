import { supabase } from './supabase';

// ============================================================
// AUTH
// ============================================================

export async function signUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user) {
    // Profile creation happens here rather than a DB trigger, so we can
    // surface a clear error to the user if it fails, rather than a silent
    // orphaned auth record.
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({ id: data.user.id, display_name: displayName });
    if (profileError) throw profileError;
  }
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/?reset=true`,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function deleteAccount() {
  const { data: sessionData } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke('delete-account', {
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
  });
  // Supabase's client wraps non-2xx Edge Function responses in a generic
  // FunctionsHttpError — error.message does NOT contain our actual JSON body
  // (e.g. "you own a circle with other members"). We have to read the real
  // response body ourselves, or the specific, helpful error we wrote in the
  // Edge Function would never actually reach the user. Found by testing this
  // path directly, not assumed to work because the code "looked right."
  if (error) {
    if (error.context && typeof error.context.json === 'function') {
      try {
        const body = await error.context.json();
        throw new Error(body.error || 'Something went wrong deleting your account.');
      } catch {
        throw new Error('Something went wrong deleting your account. Please try again.');
      }
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  await supabase.auth.signOut();
}

// ============================================================
// PUSH NOTIFICATION REMINDERS
// ============================================================

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function enablePushReminders(vapidPublicKey) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error("Reminders aren't supported on this browser.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications were not allowed — enable them in your browser settings to use reminders.');
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
  const raw = subscription.toJSON();
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userData.user.id,
      endpoint: raw.endpoint,
      p256dh: raw.keys.p256dh,
      auth_key: raw.keys.auth,
    },
    { onConflict: 'user_id,endpoint' }
  );
  if (error) throw error;
}

export async function getPushSubscriptionStatus() {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription;
}

export async function disablePushReminders() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from('push_subscriptions').delete().eq('user_id', userData.user.id).eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  }
}

export async function updateReminderTimes(medicationId, times) {
  const { error } = await supabase.from('medications').update({ reminder_times: times }).eq('id', medicationId);
  if (error) throw error;
}

// ============================================================
// CARE CIRCLES
// ============================================================

export async function createCircle(name) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('care_circles')
    .insert({ name, created_by: userData.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getMyCircles() {
  // RLS ensures this only ever returns circles the current user belongs to —
  // no client-side filtering needed or trusted.
  const { data, error } = await supabase
    .from('care_circles')
    .select('*, circle_members(user_id, role, last_seen_at)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function markCircleSeen(circleId) {
  const { error } = await supabase.rpc('mark_circle_seen', { target_circle_id: circleId });
  if (error) throw error;
}

export async function getCircleMembers(circleId) {
  const { data, error } = await supabase
    .from('circle_members')
    .select('user_id, role, joined_at, user_profiles(display_name)')
    .eq('circle_id', circleId);
  if (error) throw error;
  return data;
}

export async function removeMember(circleId, userId) {
  const { error } = await supabase
    .from('circle_members')
    .delete()
    .eq('circle_id', circleId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ============================================================
// INVITATIONS
// ============================================================

export async function createInvitation(circleId) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('invitations')
    .insert({ circle_id: circleId, created_by: userData.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function revokeInvitation(invitationId) {
  const { error } = await supabase
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId);
  if (error) throw error;
}

export async function redeemInvitation(token) {
  // Calls the security-definer function in the schema — the client never
  // inserts into circle_members directly, so a user can't grant themselves
  // access to a circle by guessing/forging a row.
  const { data, error } = await supabase.rpc('redeem_invitation', { invite_token: token });
  if (error) throw error;
  return data; // circle_id
}

// ============================================================
// MEDICATIONS
// ============================================================

export async function getMedications(circleId) {
  const { data, error } = await supabase
    .from('medications')
    .select('*')
    .eq('circle_id', circleId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addMedication(circleId, med) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('medications')
    .insert({ ...med, circle_id: circleId, added_by: userData.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMedication(id, updates) {
  const { error } = await supabase.from('medications').update(updates).eq('id', id);
  if (error) throw error;
}

export async function softDeleteMedication(id) {
  const { error } = await supabase
    .from('medications')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// APPOINTMENTS
// ============================================================

export async function getAppointments(circleId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, user_profiles(display_name)')
    .eq('circle_id', circleId)
    .is('deleted_at', null)
    .order('date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addAppointment(circleId, appt) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('appointments')
    .insert({ ...appt, circle_id: circleId, added_by: userData.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function assignAppointmentResponsibility(appointmentId, userId) {
  const { error } = await supabase.from('appointments').update({ responsible_user_id: userId }).eq('id', appointmentId);
  if (error) throw error;
}

export async function softDeleteAppointment(id) {
  const { error } = await supabase
    .from('appointments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// CARE NOTES
// ============================================================

export async function getNotes(circleId, limit = 50) {
  const { data, error } = await supabase
    .from('care_notes')
    .select('*, user_profiles(display_name)')
    .eq('circle_id', circleId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function addNote(circleId, content) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('care_notes')
    .insert({ circle_id: circleId, content, author_id: userData.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateNote(id, content) {
  const { error } = await supabase
    .from('care_notes')
    .update({ content, edited_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteNote(id) {
  const { error } = await supabase.from('care_notes').delete().eq('id', id);
  if (error) throw error;
}
