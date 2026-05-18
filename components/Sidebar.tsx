'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function Sidebar() {
  const router   = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href.split('?')[0] + '/');

  useEffect(() => {
    let mounted = true;
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => { if (mounted && d?.is_admin) setIsAdmin(true); })
      .catch(() => {});
    return () => { mounted = false };
  }, []);

  const NAV = [
    {
      section: 'Archive',
      items: [
        { label: 'Dashboard',     icon: '⊞', href: '/dashboard' },
        { label: 'All Archetypes', icon: '◉', href: '/archive' },
        { label: 'The Men',       icon: '△', href: '/archive?gender=M' },
        { label: 'The Women',     icon: '▽', href: '/archive?gender=F' },
        { label: 'Pulse Quiz',    icon: '◆', href: '/pulse-quiz' },
      ],
    },
    {
      section: 'Create',
      items: [
        { label: 'New Companion', icon: '+', href: '/onboarding' },
        { label: 'Image Studio',  icon: '□', href: '/create' },
      ],
    },
    {
      section: 'Account',
      items: [
        { label: 'Settings',      icon: '◎', href: '/settings' },
        { label: 'Credits',       icon: '◐', href: '/credits' },
      ],
    },
  ];

  return (
    <aside
      style={{
        width: '220px',
        minWidth: '220px',
        background: '#0a0a0a',
        borderRight: '1px solid #1e1e1e',
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        position: 'sticky',
        top: 0,
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '22px 20px 18px',
          borderBottom: '1px solid #1e1e1e',
        }}
      >
        <button
          onClick={() => router.push('/dashboard')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '24px',
              fontWeight: 500,
              color: '#ffffff',
              letterSpacing: '0.1em',
              lineHeight: 1,
            }}
          >
            ALYRA X
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: '#ffffff',
              marginTop: '4px',
              opacity: 0.5,
            }}
          >
            Private Archive
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, paddingTop: '8px' }}>
        {NAV.map((group) => (
          <div key={group.section}>
            <div
              style={{
                padding: '16px 20px 6px',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: '#ffffff',
                opacity: 0.4,
              }}
            >
              {group.section}
            </div>
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <button
                  key={item.label}
                  onClick={() => router.push(item.href)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    padding: '10px 20px',
                    background: active ? 'rgba(230,57,70,0.1)' : 'none',
                    border: 'none',
                    borderLeft: active ? '2px solid #e63946' : '2px solid transparent',
                    cursor: 'pointer',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontFamily: 'var(--font-body)',
                    fontWeight: active ? 500 : 400,
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'none';
                  }}
                >
                  <span style={{ fontSize: '14px', opacity: active ? 1 : 0.6 }}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}

        {/* Admin section */}
        {isAdmin && (
          <div>
            <div
              style={{
                padding: '16px 20px 6px',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: '#e63946',
                opacity: 0.8,
              }}
            >
              Admin
            </div>
            {[
              { label: 'Archetypes',    href: '/admin/archetypes' },
              { label: 'Media Manager', href: '/admin/profile' },
            ].map((item) => {
              const active = isActive(item.href);
              return (
                <button
                  key={item.label}
                  onClick={() => router.push(item.href)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    padding: '10px 20px',
                    background: active ? 'rgba(230,57,70,0.1)' : 'none',
                    border: 'none',
                    borderLeft: active ? '2px solid #e63946' : '2px solid transparent',
                    cursor: 'pointer',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontFamily: 'var(--font-body)',
                    fontWeight: active ? 500 : 400,
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '14px', opacity: 0.6 }}>◈</span>
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div style={{ borderTop: '1px solid #1e1e1e', padding: '8px 0' }}>
        <button
          onClick={() => (window.location.href = '/auth/signout')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            width: '100%',
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#ffffff',
            fontSize: '14px',
            fontFamily: 'var(--font-body)',
            opacity: 0.5,
            textAlign: 'left',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.5')}
        >
          <span>◁</span> Sign Out
        </button>
      </div>
    </aside>
  );
}
