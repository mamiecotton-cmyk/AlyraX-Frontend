'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

type Mode = 'signin' | 'signup' | 'magic';

export default function LoginPage() {
  const router  = useRouter();
  const supabase = createClient();

  const [mode, setMode]       = useState<Mode>('signin');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reset = () => { setError(null); setSuccess(null); };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    reset();

    if (mode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      setLoading(false);
      if (error) return setError(error.message);
      return setSuccess('Check your inbox — access link dispatched.');
    }

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      setLoading(false);
      if (error) return setError(error.message);
      return setSuccess('Account created. Check your email to verify access.');
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/dashboard');
    router.refresh();
  };

  const handleGoogle = async () => {
    setLoading(true);
    reset();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setLoading(false); setError(error.message); }
  };

  const titles: Record<Mode, string> = {
    signin: 'Request Archive Access',
    signup: 'Create Clearance',
    magic:  'Passwordless Entry',
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        background: 'var(--onyx)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            radial-gradient(circle at 20% 50%, rgba(212,175,55,0.03) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(212,175,55,0.02) 0%, transparent 40%)
          `,
          pointerEvents: 'none',
        }}
      />

      <div
        className="fade-in"
        style={{
          width: '100%',
          maxWidth: '380px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '36px',
              fontWeight: 400,
              color: 'var(--gold)',
              letterSpacing: '0.14em',
              marginBottom: '6px',
            }}
          >
            ALYRA X
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '8px',
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: 'var(--ivory-ghost)',
              marginBottom: '20px',
            }}
          >
            ◈ Private Archive ◈
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '15px',
              fontStyle: 'italic',
              fontWeight: 300,
              color: 'var(--ivory-muted)',
            }}
          >
            {titles[mode]}
          </div>
        </div>

        {/* Gold rule */}
        <div className="gold-rule" style={{ marginBottom: '28px' }} />

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            width: '100%',
            padding: '12px',
            background: 'var(--charcoal)',
            border: '1px solid var(--border-mid)',
            borderRadius: '2px',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            color: 'var(--ivory-dim)',
            marginBottom: '20px',
            transition: 'border-color 0.15s',
            opacity: loading ? 0.6 : 1,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--gold-dim)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-mid)')}
        >
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-dark)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.2em', color: 'var(--ivory-ghost)', textTransform: 'uppercase' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-dark)' }} />
        </div>

        {/* Form */}
        <form onSubmit={handleEmailAuth}>
          <input
            type="email"
            required
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              padding: '11px 14px',
              marginBottom: '10px',
              background: 'var(--charcoal)',
              border: '1px solid var(--border-mid)',
              borderRadius: '2px',
              color: 'var(--ivory)',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--gold-dim)')}
            onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--border-mid)')}
          />

          {mode !== 'magic' && (
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              style={{
                display: 'block',
                width: '100%',
                padding: '11px 14px',
                marginBottom: '10px',
                background: 'var(--charcoal)',
                border: '1px solid var(--border-mid)',
                borderRadius: '2px',
                color: 'var(--ivory)',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--gold-dim)')}
              onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--border-mid)')}
            />
          )}

          {error && (
            <div style={{ fontSize: '11px', color: '#c0392b', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', marginBottom: '10px', padding: '8px 12px', background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: '2px' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ fontSize: '11px', color: '#27ae60', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', marginBottom: '10px', padding: '8px 12px', background: 'rgba(39,174,96,0.08)', border: '1px solid rgba(39,174,96,0.2)', borderRadius: '2px' }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-gold"
            style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '4px', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? '...' : mode === 'signin' ? '◈ Enter the Archive' : mode === 'signup' ? '◆ Create Clearance' : '◎ Dispatch Access Link'}
          </button>
        </form>

        {/* Mode switchers */}
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
          {mode === 'signin' && (
            <>
              <button onClick={() => { setMode('magic'); reset(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ivory-muted)' }}>
                Enter without password ▷
              </button>
              <button onClick={() => { setMode('signup'); reset(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ivory-muted)' }}>
                No account? Request clearance ▷
              </button>
            </>
          )}
          {mode !== 'signin' && (
            <button onClick={() => { setMode('signin'); reset(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ivory-muted)' }}>
              ◁ Back to sign in
            </button>
          )}
        </div>

        <div style={{ marginTop: '32px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ivory-ghost)' }}>
          Discreet Billing · AA Technical Services
        </div>
      </div>
    </div>
  );
}