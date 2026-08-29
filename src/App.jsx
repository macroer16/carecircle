import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import * as api from './lib/api';
import { Loader2, Plus, LogOut, Pill, Calendar, MessageSquare, Trash2, Copy, Check, Users, UserMinus, Ban, Settings, AlertTriangle, Heart } from 'lucide-react';

// ============================================================
// DESIGN SYSTEM — grounded in the actual product: a calm, warm,
// trustworthy tool for adult children coordinating a parent's care.
// Deliberately not clinical-blue (this isn't a hospital system) and
// not the generic AI-default cream+terracotta pairing — sage green
// reads as care/growth/calm without reaching for either default.
// ============================================================
const color = {
  ink: '#2B2A27',        // primary text
  inkSoft: '#726C61',    // secondary text
  paper: '#FAF8F3',      // page background — warm, not stark white
  card: '#FFFFFF',
  line: '#E6E1D6',       // borders, dividers
  sage: '#5F7566',       // primary brand/action color
  sageDeep: '#485A4D',   // pressed/emphasis state
  sageMist: '#EEF1EC',   // soft tinted backgrounds (highlights, badges)
  clay: '#C97D5D',       // sparing accent — attention, "since you checked"
  rust: '#B5493F',       // errors/destructive only
};

const font = {
  display: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', // warmth, human — headings & wordmark only
  body: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', // clarity for less-technical readers
};

const styles = {
  page: { minHeight: '100vh', background: color.paper, fontFamily: font.body, color: color.ink },
  container: { maxWidth: 480, margin: '0 auto', padding: '20px 16px 100px' },
  card: { background: color.card, borderRadius: 16, padding: 20, marginBottom: 12, border: `1px solid ${color.line}`, boxShadow: '0 1px 2px rgba(43,42,39,0.04)' },
  button: { width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: color.sage, color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s ease', boxShadow: '0 1px 2px rgba(95,117,102,0.25)' },
  buttonSecondary: { padding: '13px 16px', minHeight: 44, borderRadius: 10, border: `1px solid ${color.line}`, background: color.card, color: color.ink, fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.15s ease' },
  input: { width: '100%', boxSizing: 'border-box', padding: '14px', borderRadius: 12, border: `1px solid ${color.line}`, fontSize: 16, marginBottom: 12, fontFamily: font.body, transition: 'border-color 0.15s ease' },
  label: { fontSize: 13, color: color.inkSoft, marginBottom: 6, display: 'block', fontWeight: 500 },
  h1: { fontSize: 22, fontWeight: 600, margin: '4px 0 20px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: font.display, letterSpacing: '-0.01em' },
  errorText: { color: color.rust, fontSize: 14, marginBottom: 12 },
  emptyState: { textAlign: 'center', padding: '32px 16px', color: color.inkSoft },
};

// Signature mark: two overlapping circles — a literal "circle of care"
// shared between people — rather than a generic heart icon.
function CareMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="13" cy="16" r="10" fill={color.sageMist} stroke={color.sage} strokeWidth="1.5" />
      <circle cx="19" cy="16" r="10" fill="none" stroke={color.sage} strokeWidth="1.5" />
    </svg>
  );
}

// Global polish: button interaction states, visible keyboard focus (accessibility
// floor per design guidance), and respecting reduced-motion preferences.
export function GlobalStyle() {
  return (
    <style>{`
      button { font-family: ${font.body}; }
      button:hover:not(:disabled) { filter: brightness(0.96); }
      button:active:not(:disabled) { filter: brightness(0.92); transform: translateY(0.5px); }
      button:disabled { cursor: not-allowed; opacity: 0.6; }
      button:focus-visible, input:focus-visible, textarea:focus-visible {
        outline: 2px solid ${color.sage}; outline-offset: 2px;
      }
      input:focus, textarea:focus { border-color: ${color.sage} !important; outline: none; }
      @media (prefers-reduced-motion: reduce) {
        * { transition: none !important; animation: none !important; }
      }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
    `}</style>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [circles, setCircles] = useState([]);
  const [activeCircle, setActiveCircle] = useState(null);
  const [view, setView] = useState('dashboard');
  const [inviteToken, setInviteToken] = useState(null);
  const [passwordResetMode, setPasswordResetMode] = useState(false);

  useEffect(() => {
    // Check for an invitation link on load: /?invite=TOKEN
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (token) setInviteToken(token);
    if (params.get('reset') === 'true') setPasswordResetMode(true);

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadCircles = useCallback(async () => {
    if (!session) return;
    try {
      const data = await api.getMyCircles();
      setCircles(data);
      if (data.length > 0 && !activeCircle) setActiveCircle(data[0]);
    } catch (err) {
      console.error(err);
    }
  }, [session, activeCircle]);

  useEffect(() => { loadCircles(); }, [session]);

  if (authLoading) {
    return <Centered><Loader2 className="spin" size={28} color="#5F7566" /></Centered>;
  }

  if (passwordResetMode && session) {
    return <SetNewPasswordScreen onDone={() => { setPasswordResetMode(false); window.history.replaceState({}, '', '/'); }} />;
  }

  if (!session) {
    return <AuthScreen inviteToken={inviteToken} onAuthed={() => {}} />;
  }

  if (inviteToken) {
    return <RedeemInviteScreen token={inviteToken} onDone={() => { setInviteToken(null); window.history.replaceState({}, '', '/'); loadCircles(); }} />;
  }

  if (circles.length === 0) {
    return <CreateFirstCircle onCreated={loadCircles} />;
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <TopBar circle={activeCircle} onSignOut={() => supabase.auth.signOut()} onSettings={() => setView('settings')} />
        {view === 'dashboard' && <Dashboard circle={activeCircle} currentUserId={session.user.id} />}
        {view === 'medications' && <MedicationsView circle={activeCircle} />}
        {view === 'appointments' && <AppointmentsView circle={activeCircle} />}
        {view === 'notes' && <NotesView circle={activeCircle} currentUserId={session.user.id} />}
        {view === 'family' && <FamilyView circle={activeCircle} onChanged={loadCircles} />}
        {view === 'settings' && <SettingsView onBack={() => setView('dashboard')} />}
      </div>
      {view !== 'settings' && <BottomNav view={view} setView={setView} />}
    </div>
  );
}

function Centered({ children }) {
  return <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>;
}

function TopBar({ circle, onSignOut, onSettings }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CareMark size={22} />
        <span style={{ fontWeight: 700, fontSize: 18 }}>{circle?.name || 'CareCircle'}</span>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onSettings} style={{ background: 'none', border: 'none', color: '#726C61', cursor: 'pointer', padding: 12, margin: -12, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Settings size={18} /></button>
        <button onClick={onSignOut} style={{ background: 'none', border: 'none', color: '#726C61', cursor: 'pointer', padding: 12, margin: -12, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LogOut size={18} /></button>
      </div>
    </div>
  );
}

function SettingsView({ onBack }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remindersOn, setRemindersOn] = useState(false);
  const [remindersBusy, setRemindersBusy] = useState(false);
  const [remindersError, setRemindersError] = useState('');

  useEffect(() => {
    api.getPushSubscriptionStatus().then(setRemindersOn).catch(() => {});
  }, []);

  async function toggleReminders() {
    setRemindersBusy(true); setRemindersError('');
    try {
      if (remindersOn) {
        await api.disablePushReminders();
        setRemindersOn(false);
      } else {
        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!vapidKey) throw new Error('Reminders aren\'t set up for this deployment yet.');
        await api.enablePushReminders(vapidKey);
        setRemindersOn(true);
      }
    } catch (err) {
      setRemindersError(err.message);
    } finally {
      setRemindersBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true); setError('');
    try {
      await api.deleteAccount();
      // signOut inside deleteAccount triggers the auth state change automatically
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 style={styles.h1}><Settings size={20} /> Settings</h1>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Medication reminders</div>
            <div style={{ fontSize: 13, color: '#726C61' }}>Get a notification when it's time for a scheduled medication.</div>
          </div>
        </div>
        {remindersError && <p style={styles.errorText}>{remindersError}</p>}
        <button style={remindersOn ? styles.buttonSecondary : styles.button} disabled={remindersBusy} onClick={toggleReminders}>
          {remindersBusy ? 'Please wait…' : remindersOn ? 'Turn off reminders' : 'Turn on reminders'}
        </button>
      </div>
      <div style={{ ...styles.card, borderLeft: '3px solid #b5493f' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <AlertTriangle size={16} color="#b5493f" />
          <span style={{ fontWeight: 600, color: '#b5493f' }}>Delete account</span>
        </div>
        <p style={{ fontSize: 13, color: '#726C61', marginBottom: 12 }}>
          This permanently deletes your account. If you own a Care Circle with other members in it,
          you'll need to transfer ownership or remove them first.
        </p>
        {!confirming ? (
          <button style={{ ...styles.buttonSecondary, color: '#b5493f' }} onClick={() => setConfirming(true)}>Delete my account</button>
        ) : (
          <>
            <label style={styles.label}>Type DELETE to confirm</label>
            <input style={styles.input} value={confirmText} onChange={e => setConfirmText(e.target.value)} />
            {error && <p style={styles.errorText}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={styles.buttonSecondary} onClick={() => { setConfirming(false); setConfirmText(''); setError(''); }}>Cancel</button>
              <button style={{ ...styles.button, flex: 1, background: '#b5493f' }} disabled={confirmText !== 'DELETE' || busy} onClick={handleDelete}>{busy ? 'Deleting…' : 'Permanently delete'}</button>
            </div>
          </>
        )}
      </div>
      <button style={{ ...styles.buttonSecondary, width: '100%', marginTop: 8 }} onClick={onBack}>Back</button>
    </div>
  );
}

function BottomNav({ view, setView }) {
  const items = [
    { id: 'dashboard', icon: Heart, label: 'Home' },
    { id: 'medications', icon: Pill, label: 'Meds' },
    { id: 'appointments', icon: Calendar, label: 'Visits' },
    { id: 'notes', icon: MessageSquare, label: 'Updates' },
    { id: 'family', icon: Users, label: 'Family' },
  ];
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #eee', display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {items.map(({ id, icon: Icon, label }) => (
        <button key={id} onClick={() => setView(id)} style={{ flex: 1, padding: '10px 0 8px', background: 'none', border: 'none', color: view === id ? '#5F7566' : '#9B9484', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <Icon size={20} />
          <span style={{ fontSize: 11 }}>{label}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================
// AUTH
// ============================================================

function AuthScreen({ inviteToken }) {
  const [mode, setMode] = useState('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      if (mode === 'signup') await api.signUp(email, password, displayName);
      else if (mode === 'login') await api.signIn(email, password);
      else if (mode === 'forgot') { await api.requestPasswordReset(email); setResetSent(true); }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'forgot') {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.container, paddingTop: 60 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <CareMark size={40} />
            <h1 style={{ fontSize: 22, margin: 0 }}>Reset your password</h1>
          </div>
          <div style={styles.card}>
            {resetSent ? (
              <p style={{ fontSize: 14, color: '#2b2a27' }}>If an account exists for that email, we've sent a link to reset your password. Check your inbox.</p>
            ) : (
              <form onSubmit={handleSubmit}>
                <label style={styles.label}>Email</label>
                <input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
                {error && <p style={styles.errorText}>{error}</p>}
                <button style={styles.button} disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
              </form>
            )}
            <button onClick={() => { setMode('login'); setResetSent(false); setError(''); }} style={{ ...styles.buttonSecondary, width: '100%', marginTop: 12 }}>Back to log in</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={{ ...styles.container, paddingTop: 60 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <CareMark size={40} />
          <h1 style={{ fontSize: 26, margin: 0, fontFamily: font.display, fontWeight: 600 }}>CareCircle</h1>
          <p style={{ color: '#726C61', fontSize: 14, marginTop: 6 }}>
            {inviteToken ? "You've been invited to a family Care Circle — sign in or create an account to join." : "Your family's shared place for care coordination."}
          </p>
        </div>
        <div style={styles.card}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#FAF8F3', borderRadius: 10, padding: 4 }}>
            <button onClick={() => setMode('signup')} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: mode === 'signup' ? '#fff' : 'transparent', fontWeight: 500, cursor: 'pointer' }}>Sign up</button>
            <button onClick={() => setMode('login')} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: mode === 'login' ? '#fff' : 'transparent', fontWeight: 500, cursor: 'pointer' }}>Log in</button>
          </div>
          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <>
                <label style={styles.label}>Your name</label>
                <input style={styles.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Sarah" required />
              </>
            )}
            <label style={styles.label}>Email</label>
            <input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <label style={styles.label}>Password</label>
            <input style={styles.input} type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required />
            {mode === 'login' && (
              <button type="button" onClick={() => { setMode('forgot'); setError(''); }} style={{ background: 'none', border: 'none', color: '#5F7566', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12, display: 'block' }}>Forgot password?</button>
            )}
            {error && <p style={styles.errorText}>{error}</p>}
            <button style={styles.button} disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}</button>
          </form>
        </div>
        {mode === 'signup' && (
          <p style={{ fontSize: 12, color: '#726C61', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
            By signing up you agree that CareCircle is a family organisation tool, not a medical or
            emergency service. See our privacy notice for how care information is stored and who can see it.
          </p>
        )}
      </div>
    </div>
  );
}

function CreateFirstCircle({ onCreated }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.createCircle(name);
      await onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={{ ...styles.container, paddingTop: 60 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <CareMark size={40} />
          <h1 style={{ fontSize: 22, margin: 0 }}>Set up your Care Circle</h1>
          <p style={{ color: '#726C61', fontSize: 14, marginTop: 8 }}>Give it a name your family will recognise.</p>
        </div>
        <div style={styles.card}>
          <form onSubmit={handleCreate}>
            <label style={styles.label}>Circle name</label>
            <input style={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mum's Care" required autoFocus />
            {error && <p style={styles.errorText}>{error}</p>}
            <button style={styles.button} disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create Care Circle'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}

function SetNewPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <div style={{ width: '100%', maxWidth: 340 }}>
        <div style={styles.card}>
          {done ? (
            <>
              <p>Your password has been updated.</p>
              <button style={styles.button} onClick={onDone}>Continue</button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <label style={styles.label}>New password</label>
              <input style={styles.input} type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
              {error && <p style={styles.errorText}>{error}</p>}
              <button style={styles.button} disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</button>
            </form>
          )}
        </div>
      </div>
    </Centered>
  );
}

function RedeemInviteScreen({ token, onDone }) {
  const [status, setStatus] = useState('joining');
  const [error, setError] = useState('');

  useEffect(() => {
    api.redeemInvitation(token)
      .then(() => setStatus('done'))
      .catch(err => { setError(err.message); setStatus('error'); });
  }, [token]);

  return (
    <Centered>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        {status === 'joining' && <><Loader2 className="spin" size={28} color="#5F7566" /><p style={{ marginTop: 12, color: '#726C61' }}>Joining your family's Care Circle…</p></>}
        {status === 'done' && <><CareMark size={30} /><p style={{ marginTop: 12 }}>You're in! Taking you to the dashboard…</p><button style={{ ...styles.button, marginTop: 12 }} onClick={onDone}>Continue</button></>}
        {status === 'error' && <><p style={{ color: '#b5493f' }}>{error}</p><button style={{ ...styles.buttonSecondary, marginTop: 12 }} onClick={onDone}>Go back</button></>}
      </div>
    </Centered>
  );
}

// ============================================================
// DASHBOARD
// ============================================================

function Dashboard({ circle, currentUserId }) {
  const [meds, setMeds] = useState([]);
  const [appts, setAppts] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [changes, setChanges] = useState([]);

  useEffect(() => {
    if (!circle) return;
    const myMembership = circle.circle_members?.find(m => m.user_id === currentUserId);
    const lastSeen = myMembership?.last_seen_at;

    Promise.all([api.getMedications(circle.id), api.getAppointments(circle.id), api.getNotes(circle.id, 5)])
      .then(([m, a, n]) => {
        setMeds(m); setAppts(a); setNotes(n);
        if (lastSeen) {
          const cutoff = new Date(lastSeen).getTime();
          // Meaningful change descriptions, not just a count — each item
          // says WHAT changed, in plain language, not just "1 update."
          const medChanges = m.filter(x => new Date(x.created_at).getTime() > cutoff)
            .map(x => ({ type: 'medication', icon: '💊', text: `${x.name} was added` }));
          const apptChanges = a.filter(x => new Date(x.created_at).getTime() > cutoff)
            .map(x => ({ type: 'appointment', icon: '🗓️', text: `${x.doctor_name || 'An appointment'} was added` }));
          const noteChanges = n.filter(x => new Date(x.created_at).getTime() > cutoff)
            .map(x => ({ type: 'update', icon: '💬', text: `${x.user_profiles?.display_name || 'Someone'} posted an update` }));
          setChanges([...apptChanges, ...noteChanges, ...medChanges]);
        }
      })
      .finally(() => setLoading(false));

    api.markCircleSeen(circle.id).catch(() => {});
  }, [circle, currentUserId]);

  const today = new Date(new Date().toDateString());
  const upcoming = appts.filter(a => new Date(a.date) >= today);
  const nextAppt = upcoming[0];
  // "Needs attention": upcoming appointments nobody's been assigned to yet —
  // a real, useful signal, not manufactured urgency.
  const unassigned = upcoming.filter(a => !a.responsible_user_id);
  // "Who's handling what": group upcoming appointments by the person attending.
  const byPerson = {};
  upcoming.forEach(a => {
    if (a.responsible_user_id && a.user_profiles?.display_name) {
      const name = a.user_profiles.display_name;
      if (!byPerson[name]) byPerson[name] = [];
      byPerson[name].push(a.doctor_name || 'an appointment');
    }
  });

  if (loading) return <div style={styles.emptyState}><Loader2 className="spin" size={22} /></div>;

  return (
    <div>
      <h1 style={styles.h1}>{circle?.name || "What's happening"}</h1>
      <p style={{ color: color.inkSoft, fontSize: 14, marginTop: -14, marginBottom: 16 }}>
        {changes.length === 0 && unassigned.length === 0 ? 'Everything looks up to date.' : 'Here\'s what\'s new since you last checked.'}
      </p>

      {changes.length > 0 && (
        <div style={{ ...styles.card, background: color.sageMist, border: `1px solid ${color.line}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: color.sageDeep, marginBottom: 8 }}>
            SINCE YOU LAST CHECKED — {changes.length} {changes.length === 1 ? 'CHANGE' : 'CHANGES'}
          </div>
          {changes.map((c, i) => (
            <div key={i} style={{ fontSize: 14, padding: '4px 0', display: 'flex', gap: 8 }}>
              <span>{c.icon}</span><span>{c.text}</span>
            </div>
          ))}
        </div>
      )}

      {unassigned.length > 0 && (
        <div style={{ ...styles.card, borderLeft: `3px solid ${color.clay}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: color.clay, marginBottom: 6 }}>NEEDS ATTENTION</div>
          {unassigned.map(a => (
            <div key={a.id} style={{ fontSize: 14, padding: '4px 0' }}>
              {a.doctor_name || 'Appointment'} on {new Date(a.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} — nobody's assigned yet
            </div>
          ))}
        </div>
      )}

      <div style={styles.card}>
        <div style={{ fontSize: 13, color: color.inkSoft, fontWeight: 600, marginBottom: 6 }}>NEXT</div>
        {nextAppt ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{nextAppt.doctor_name || 'Appointment'}</div>
            <div style={{ color: color.inkSoft, fontSize: 14 }}>{new Date(nextAppt.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}{nextAppt.time ? ` at ${nextAppt.time}` : ''}</div>
            {nextAppt.user_profiles?.display_name && (
              <div style={{ color: color.sageDeep, fontSize: 14, marginTop: 4 }}>{nextAppt.user_profiles.display_name} is attending</div>
            )}
          </>
        ) : <div style={{ color: color.inkSoft, fontSize: 14 }}>No upcoming appointments recorded.</div>}
      </div>

      {Object.keys(byPerson).length > 0 && (
        <div style={styles.card}>
          <div style={{ fontSize: 13, color: color.inkSoft, fontWeight: 600, marginBottom: 8 }}>WHO'S HANDLING WHAT</div>
          {Object.entries(byPerson).map(([name, items]) => (
            <div key={name} style={{ fontSize: 14, padding: '4px 0' }}>
              <span style={{ fontWeight: 600 }}>{name}</span> — {items.join(', ')}
            </div>
          ))}
        </div>
      )}

      <div style={styles.card}>
        <div style={{ fontSize: 13, color: color.inkSoft, fontWeight: 600, marginBottom: 6 }}>CURRENT MEDICATIONS ({meds.length})</div>
        {meds.length === 0 ? <div style={{ color: color.inkSoft, fontSize: 14 }}>None recorded yet.</div> :
          meds.slice(0, 3).map(m => <div key={m.id} style={{ fontSize: 14, padding: '4px 0' }}>{m.name} {m.dosage && `— ${m.dosage}`}</div>)}
      </div>
      <div style={styles.card}>
        <div style={{ fontSize: 13, color: color.inkSoft, fontWeight: 600, marginBottom: 6 }}>RECENT UPDATES</div>
        {notes.length === 0 ? <div style={{ color: color.inkSoft, fontSize: 14 }}>No updates yet — add one from the Updates tab.</div> :
          notes.map(n => (
            <div key={n.id} style={{ fontSize: 14, padding: '6px 0', borderBottom: '1px solid #EDE8DC' }}>
              <span style={{ fontWeight: 600 }}>{n.user_profiles?.display_name}: </span>{n.content}
            </div>
          ))}
      </div>
    </div>
  );
}

// ============================================================
// MEDICATIONS
// ============================================================

function MedicationsView({ circle }) {
  const [meds, setMeds] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getMedications(circle.id).then(setMeds).finally(() => setLoading(false));
  }, [circle.id]);

  useEffect(load, [load]);

  return (
    <div>
      <h1 style={styles.h1}><Pill size={20} /> Medications</h1>
      {!showForm && <button style={{ ...styles.button, marginBottom: 16 }} onClick={() => setShowForm(true)}><Plus size={16} style={{ verticalAlign: -3 }} /> Add medication</button>}
      {showForm && <AddMedicationForm circleId={circle.id} onDone={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />}
      {loading ? <Loader2 className="spin" size={20} /> : meds.length === 0 ? (
        <div style={styles.emptyState}>No medications recorded yet.<br />Add one so the whole family stays current.</div>
      ) : meds.map(m => (
        <div key={m.id} style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{m.name}</div>
              {m.dosage && <div style={{ fontSize: 14, color: '#726C61' }}>{m.dosage}</div>}
              {m.schedule_text && <div style={{ fontSize: 14, color: '#726C61' }}>{m.schedule_text}</div>}
              {m.notes && <div style={{ fontSize: 13, color: '#726C61', marginTop: 4 }}>{m.notes}</div>}
            </div>
            <button onClick={() => api.softDeleteMedication(m.id).then(load)} style={{ background: 'none', border: 'none', color: '#B8A99B', cursor: 'pointer', padding: 12, margin: -12, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AddMedicationForm({ circleId, onDone, onCancel }) {
  const [form, setForm] = useState({ name: '', dosage: '', schedule_text: '', notes: '' });
  const [reminderTime, setReminderTime] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    const payload = { ...form };
    if (reminderTime) payload.reminder_times = [`${reminderTime}:00`]; // Postgres time array format
    await api.addMedication(circleId, payload);
    onDone();
  }

  return (
    <div style={styles.card}>
      <label style={styles.label}>Name</label>
      <input style={styles.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Metformin" autoFocus />
      <label style={styles.label}>Dosage</label>
      <input style={styles.input} value={form.dosage} onChange={e => setForm({ ...form, dosage: e.target.value })} placeholder="e.g. 10mg" />
      <label style={styles.label}>Schedule (written note, e.g. for the family to read)</label>
      <input style={styles.input} value={form.schedule_text} onChange={e => setForm({ ...form, schedule_text: e.target.value })} placeholder="e.g. 8am and 8pm with food" />
      <label style={styles.label}>Reminder time (optional — sends a notification, one time per medication for now)</label>
      <input style={styles.input} type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} />
      <label style={styles.label}>Notes</label>
      <input style={styles.input} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={styles.buttonSecondary} onClick={onCancel}>Cancel</button>
        <button style={{ ...styles.button, flex: 1 }} disabled={busy || !form.name.trim()} onClick={handleSave}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

// ============================================================
// APPOINTMENTS
// ============================================================

function AppointmentsView({ circle }) {
  const [appts, setAppts] = useState([]);
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.getAppointments(circle.id), api.getCircleMembers(circle.id)])
      .then(([a, m]) => { setAppts(a); setMembers(m); })
      .finally(() => setLoading(false));
  }, [circle.id]);

  useEffect(load, [load]);

  async function handleAssign(apptId, userId) {
    await api.assignAppointmentResponsibility(apptId, userId || null);
    load();
  }

  return (
    <div>
      <h1 style={styles.h1}><Calendar size={20} /> Appointments</h1>
      {!showForm && <button style={{ ...styles.button, marginBottom: 16 }} onClick={() => setShowForm(true)}><Plus size={16} style={{ verticalAlign: -3 }} /> Add appointment</button>}
      {showForm && <AddAppointmentForm circleId={circle.id} members={members} onDone={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />}
      {loading ? <Loader2 className="spin" size={20} /> : appts.length === 0 ? (
        <div style={styles.emptyState}>No upcoming appointments.<br />Keep your family up to date by adding the next one.</div>
      ) : appts.map(a => (
        <div key={a.id} style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{a.doctor_name || 'Appointment'}</div>
              <div style={{ fontSize: 14, color: color.inkSoft }}>{new Date(a.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}{a.time && ` · ${a.time}`}</div>
              {a.location && <div style={{ fontSize: 14, color: color.inkSoft }}>{a.location}</div>}
              {a.notes && <div style={{ fontSize: 13, color: color.inkSoft, marginTop: 4 }}>{a.notes}</div>}
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 12, color: color.inkSoft, marginRight: 6 }}>Attending:</label>
                <select value={a.responsible_user_id || ''} onChange={e => handleAssign(a.id, e.target.value)} style={{ fontSize: 13, padding: '4px 6px', borderRadius: 6, border: `1px solid ${color.line}` }}>
                  <option value="">Unassigned</option>
                  {members.map(m => <option key={m.user_id} value={m.user_id}>{m.user_profiles?.display_name}</option>)}
                </select>
              </div>
            </div>
            <button onClick={() => api.softDeleteAppointment(a.id).then(load)} style={{ background: 'none', border: 'none', color: '#B8A99B', cursor: 'pointer', padding: 12, margin: -12, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AddAppointmentForm({ circleId, members, onDone, onCancel }) {
  const [form, setForm] = useState({ date: '', time: '', doctor_name: '', location: '', notes: '' });
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    const payload = { ...form };
    if (responsibleUserId) payload.responsible_user_id = responsibleUserId;
    await api.addAppointment(circleId, payload);
    onDone();
  }

  return (
    <div style={styles.card}>
      <label style={styles.label}>Date</label>
      <input style={styles.input} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} autoFocus />
      <label style={styles.label}>Time</label>
      <input style={styles.input} type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
      <label style={styles.label}>Doctor / reason</label>
      <input style={styles.input} value={form.doctor_name} onChange={e => setForm({ ...form, doctor_name: e.target.value })} placeholder="e.g. Dr Patel — cardiology" />
      <label style={styles.label}>Location</label>
      <input style={styles.input} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Optional" />
      <label style={styles.label}>Who's attending</label>
      <select style={styles.input} value={responsibleUserId} onChange={e => setResponsibleUserId(e.target.value)}>
        <option value="">Not decided yet</option>
        {members.map(m => <option key={m.user_id} value={m.user_id}>{m.user_profiles?.display_name}</option>)}
      </select>
      <label style={styles.label}>Notes</label>
      <input style={styles.input} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={styles.buttonSecondary} onClick={onCancel}>Cancel</button>
        <button style={{ ...styles.button, flex: 1 }} disabled={busy || !form.date} onClick={handleSave}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

// ============================================================
// NOTES
// ============================================================

function NotesView({ circle, currentUserId }) {
  const [notes, setNotes] = useState([]);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.getNotes(circle.id).then(setNotes).finally(() => setLoading(false));
  }, [circle.id]);

  useEffect(load, [load]);

  async function handleAdd() {
    if (!content.trim()) return;
    setBusy(true); setError('');
    try {
      await api.addNote(circle.id, content.trim());
      setContent('');
      load();
    } catch (err) {
      setError("We couldn't save that update. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditContent(note.content);
  }

  async function saveEdit(id) {
    if (!editContent.trim()) return;
    try {
      await api.updateNote(id, editContent.trim());
      setEditingId(null);
      load();
    } catch (err) {
      setError("We couldn't save that change. Check your connection and try again.");
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteNote(id);
      load();
    } catch (err) {
      setError("We couldn't delete that update. Check your connection and try again.");
    }
  }

  return (
    <div>
      <h1 style={styles.h1}><MessageSquare size={20} /> Family updates</h1>
      <div style={styles.card}>
        <textarea style={{ ...styles.input, minHeight: 70, fontFamily: 'inherit', resize: 'vertical' }} value={content} onChange={e => setContent(e.target.value)} placeholder="Share an update with the family…" />
        {error && <p style={styles.errorText}>{error}</p>}
        <button style={styles.button} disabled={busy || !content.trim()} onClick={handleAdd}>{busy ? 'Posting…' : 'Post update'}</button>
      </div>
      {loading ? <Loader2 className="spin" size={20} /> : notes.length === 0 ? (
        <div style={styles.emptyState}>No updates yet.<br />Be the first to let the family know what's going on.</div>
      ) : notes.map(n => (
        <div key={n.id} style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{n.user_profiles?.display_name}</span>
            <span style={{ fontSize: 12, color: '#9B9484' }}>
              {new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              {n.edited_at && ' · edited'}
            </span>
          </div>
          {editingId === n.id ? (
            <>
              <textarea style={{ ...styles.input, minHeight: 60, fontFamily: 'inherit', resize: 'vertical' }} value={editContent} onChange={e => setEditContent(e.target.value)} autoFocus />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={styles.buttonSecondary} onClick={() => setEditingId(null)}>Cancel</button>
                <button style={{ ...styles.button, flex: 1 }} disabled={!editContent.trim()} onClick={() => saveEdit(n.id)}>Save</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15 }}>{n.content}</div>
              {/* Only the author can edit/delete — matches the RLS policy exactly,
                  so this button never appears for something the backend would reject anyway. */}
              {n.author_id === currentUserId && (
                <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
                  <button onClick={() => startEdit(n)} style={{ background: 'none', border: 'none', color: '#726C61', fontSize: 12, cursor: 'pointer', padding: '8px 0', minHeight: 44 }}>Edit</button>
                  <button onClick={() => handleDelete(n.id)} style={{ background: 'none', border: 'none', color: '#B8A99B', fontSize: 12, cursor: 'pointer', padding: '8px 0', minHeight: 44 }}>Delete</button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// FAMILY / INVITATIONS
// ============================================================

function FamilyView({ circle, onChanged }) {
  const [members, setMembers] = useState([]);
  const [invite, setInvite] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null); // holds the member being confirmed for removal

  const isOwner = circle?.circle_members?.some(m => m.user_id === currentUserId && m.role === 'owner');

  const load = useCallback(() => {
    setLoading(true);
    api.getCircleMembers(circle.id).then(setMembers).finally(() => setLoading(false));
  }, [circle.id]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id));
    load();
  }, [load]);

  async function handleInvite() {
    setError('');
    try {
      const inv = await api.createInvitation(circle.id);
      setInvite(inv);
    } catch (err) {
      setError("Couldn't create an invitation. Please try again.");
    }
  }

  async function handleRevoke() {
    try {
      await api.revokeInvitation(invite.id);
      setInvite(null);
    } catch (err) {
      setError("Couldn't revoke the invitation. Please try again.");
    }
  }

  async function handleRemove(userId) {
    try {
      await api.removeMember(circle.id, userId);
      setConfirmRemove(null);
      load();
    } catch (err) {
      setError("Couldn't remove that member. Please try again.");
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/?invite=${invite.token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <h1 style={styles.h1}><Users size={20} /> Family</h1>
      {error && <p style={styles.errorText}>{error}</p>}
      <div style={styles.card}>
        <div style={{ fontSize: 13, color: '#726C61', fontWeight: 600, marginBottom: 10 }}>MEMBERS</div>
        {loading ? <Loader2 className="spin" size={18} /> : members.map(m => (
          <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <span>{m.user_profiles?.display_name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#9B9484', textTransform: 'capitalize' }}>{m.role}</span>
              {isOwner && m.role !== 'owner' && (
                confirmRemove === m.user_id ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => handleRemove(m.user_id)} style={{ ...styles.buttonSecondary, padding: '4px 10px', fontSize: 12, color: '#b5493f' }}>Confirm</button>
                    <button onClick={() => setConfirmRemove(null)} style={{ ...styles.buttonSecondary, padding: '4px 10px', fontSize: 12 }}>Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmRemove(m.user_id)} title="Remove from circle" style={{ background: 'none', border: 'none', color: '#B8A99B', cursor: 'pointer', padding: 12, margin: -12, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UserMinus size={16} /></button>
                )
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={styles.card}>
        {!invite ? (
          <button style={styles.button} onClick={handleInvite}><Plus size={16} style={{ verticalAlign: -3 }} /> Invite a family member</button>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#726C61', marginBottom: 8 }}>Share this link — it works for 7 days:</div>
            <div style={{ ...styles.input, wordBreak: 'break-all', fontSize: 13, background: '#FAF8F3' }}>{window.location.origin}/?invite={invite.token}</div>
            <button style={{ ...styles.button, marginBottom: 8 }} onClick={copyLink}>{copied ? <><Check size={16} style={{ verticalAlign: -3 }} /> Copied</> : <><Copy size={16} style={{ verticalAlign: -3 }} /> Copy link</>}</button>
            <button style={{ ...styles.buttonSecondary, width: '100%', color: '#b5493f' }} onClick={handleRevoke}><Ban size={14} style={{ verticalAlign: -2 }} /> Revoke this invitation</button>
          </>
        )}
      </div>
    </div>
  );
}
