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
  const [session, setSession] = useState(undefined);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

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

  const sendCode = async () => {
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

  const verifyCode = async () => {
    if (!code.trim()) { setError('Enter the code from your email.'); return; }
    setError('');
    setVerifying(true);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setVerifying(false);
    if (err) { setError(err.message); return; }
  };

  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.chalkDim, fontFamily: 'sans-serif', fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (session) return children;

  const inputStyle = {
    width: '100%', background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`,
    borderRadius: 8, color: COLORS.chalk, fontFamily: 'sans-serif', fontSize: 15,
    padding: '12px 14px', outline: 'none', boxSizing: 'border-box', marginBottom: 10,
  };
  const buttonStyle = (disabled) => ({
    width: '100%', background: COLORS.amber, border: 'none', color: '#1A1300',
    borderRadius: 10, padding: '13px 0', fontFamily: 'sans-serif', fontWeight: 700,
    fontSize: 15, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1,
  });

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
          {sent ? 'Enter your code' : 'Sign in'}
        </h1>

        {sent ? (
          <>
            <div style={{ fontFamily: 'sans-serif', fontSize: 13.5, color: COLORS.chalkDim, marginBottom: 16, lineHeight: 1.6 }}>
              We sent a 6-digit code to <strong style={{ color: COLORS.chalk }}>{email}</strong>.
              Type it below — don't tap the link in the email if you're using the installed app, since that opens Safari instead.
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') verifyCode(); }}
              style={{ ...inputStyle, letterSpacing: 4, fontSize: 20, textAlign: 'center' }}
              autoFocus
            />
            {error && (
              <div style={{ color: COLORS.red, fontFamily: 'sans-serif', fontSize: 13, marginBottom: 10 }}>{error}</div>
            )}
            <button onClick={verifyCode} disabled={verifying} style={buttonStyle(verifying)}>
              {verifying ? 'Verifying…' : 'Verify and sign in'}
            </button>
            <button
              onClick={() => { setSent(false); setCode(''); setError(''); }}
              style={{
                display: 'block', margin: '16px auto 0', background: 'transparent', border: 'none',
                color: COLORS.chalkDim, fontFamily: 'sans-serif', fontSize: 13, cursor: 'pointer', padding: 0,
              }}
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'sans-serif', fontSize: 13.5, color: COLORS.chalkDim, marginBottom: 16, lineHeight: 1.6 }}>
              Enter your email and we'll send you a code to sign in — this is what keeps your homework and tests synced across your devices.
            </div>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendCode(); }}
              style={inputStyle}
            />
            {error && (
              <div style={{ color: COLORS.red, fontFamily: 'sans-serif', fontSize: 13, marginBottom: 10 }}>{error}</div>
            )}
            <button onClick={sendCode} disabled={sending} style={buttonStyle(sending)}>
              {sending ? 'Sending…' : 'Send sign-in code'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
