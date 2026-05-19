"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

type Me = {
  user?: { id: string; email?: string | null } | null;
  is_admin?: boolean;
};

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => { if (mounted) setMe(d); })
      .catch(() => { if (mounted) setMe(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="app-shell theme-dark" style={{ display: 'flex', width: '100%', minHeight: '100dvh' }}>
      <Sidebar />
      <main className="app-main app-content" style={{ flex: 1, background: 'var(--onyx)', padding: '32px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '6px' }}>
            ◎ Account
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--ivory)', marginBottom: '8px' }}>Settings</h1>

          {loading ? (
            <div style={{ marginTop: '20px', color: 'var(--ivory-ghost)' }}>Loading account…</div>
          ) : (
            <div className="settings-grid" style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
              <section style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '4px', padding: '18px' }}>
                <div style={{ marginBottom: '10px', color: 'var(--ivory-muted)' }}>Signed in as</div>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--ivory)', marginBottom: '12px' }}>{me?.user?.email ?? '—'}</div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => router.push('/profile')} style={{ padding: '8px 12px', background: 'var(--gold)', border: 'none', borderRadius: '3px', cursor: 'pointer', color: 'var(--onyx)' }}>Edit Profile</button>
                  <button onClick={() => (window.location.href = '/auth/signout')} style={{ padding: '8px 12px', background: 'transparent', border: '1px solid var(--border-mid)', borderRadius: '3px', color: 'var(--ivory-muted)' }}>Sign Out</button>
                </div>
              </section>

              <aside style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '4px', padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--gold)', marginBottom: '8px' }}>Account Actions</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button onClick={() => router.push('/credits')} style={{ padding: '8px 10px', background: 'transparent', border: '1px solid var(--border-mid)', borderRadius: '3px', color: 'var(--ivory-muted)' }}>View Credits</button>
                    <button onClick={() => router.push('/onboarding')} style={{ padding: '8px 10px', background: 'transparent', border: '1px solid var(--border-mid)', borderRadius: '3px', color: 'var(--ivory-muted)' }}>Re-run Onboarding</button>
                  </div>
                </div>

                {me?.is_admin && (
                  <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '4px', padding: '12px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--gold)', marginBottom: '8px' }}>Admin</div>
                    <button onClick={() => router.push('/admin/archetypes')} style={{ padding: '8px 10px', background: 'var(--gold)', border: 'none', borderRadius: '3px', color: 'var(--onyx)', width: '100%' }}>Open Admin</button>
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
