import { useState, useEffect } from 'react';
import { supabase } from './supabase-client.js';
import { installSupabaseStorage } from './storage-shim-supabase.js';

const COLORS = {
  bg: '#171A21',
  panel: '#1F232C',
  panelBorder: '#2C313D',
  chalk: '#F1EDE4',
  chalkDim: '#9BA1AE',
  amber: '#FF7A29',
  red: '#E8483C',
};

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) installSupabaseStorage(session.user.id);
  }, [session]);

  const sendLink = async () => {
    if (!email.trim()) { setError('Enter your email.'); return; }
    setError('');
    setSending(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  };

  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.chalkDim, fontFamily: 'sans-serif', fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (session) return children;

  return (
    <div style={{
      minHeight: '100vh', background: COLORS.bg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20, boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ fontFamily: 'sans-serif', fontSize: 13, letterSpacing: 1.5, color: COLORS.chalkDim, textTransform: 'uppercase', marginBottom: 4 }}>
          The Clock
        </div>
        <h1 style={{ fontFamily: 'sans-serif', fontSize: 28, color: COLORS.chalk, margin: '0 0 20px', fontWeight: 700 }}>
          {sent ? 'Check your email' : 'Sign in'}
        </h1>

        {sent ? (
          <div style={{ fontFamily: 'sans-serif', fontSize: 14, color: COLORS.chalkDim, lineHeight: 1.6 }}>
            We sent a sign-in link to <strong style={{ color: COLORS.chalk }}>{email}</strong>.
            Open it on this device to finish signing in — no password needed.
            <button
              onClick={() => setSent(false)}
              style={{
                display: 'block', marginTop: 16, background: 'transparent', border: 'none',
                color: COLORS.amber, fontFamily: 'sans-serif', fontSize: 13, cursor: 'pointer', padding: 0,
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontFamily: 'sans-serif', fontSize: 13.5, color: COLORS.chalkDim, marginBottom: 16, lineHeight: 1.6 }}>
              Enter your email and we'll send you a link to sign in — this is what keeps your homework and tests synced across your devices.
            </div>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendLink(); }}
              style={{
                width: '100%', background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`,
                borderRadius: 8, color: COLORS.chalk, fontFamily: 'sans-serif', fontSize: 15,
                padding: '12px 14px', outline: 'none', boxSizing: 'border-box', marginBottom: 10,
              }}
            />
            {error && (
              <div style={{ color: COLORS.red, fontFamily: 'sans-serif', fontSize: 13, marginBottom: 10 }}>{error}</div>
            )}
            <button
              onClick={sendLink}
              disabled={sending}
              style={{
                width: '100%', background: COLORS.amber, border: 'none', color: '#1A1300',
                borderRadius: 10, padding: '13px 0', fontFamily: 'sans-serif', fontWeight: 700,
                fontSize: 15, cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.7 : 1,
              }}
            >
              {sending ? 'Sending…' : 'Send sign-in link'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
