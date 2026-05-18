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
        { label: 'Dashboard',  href: '/dashboard' },
        { label: 'Archetypes', href: '/archive' },
        { label: 'The Men',    href: '/archive?gender=M' },
        { label: 'The Women',  href: '/archive?gender=F' },
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
      className="app-sidebar"
      style={{
        width: 'clamp(260px, 22vw, 300px)',
        minWidth: '260px',
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
        className="app-sidebar-logo"
        style={{
          padding: '38px 34px 30px',
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
              fontSize: '38px',
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
              fontSize: '17px',
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
      <nav className="app-sidebar-nav" style={{ flex: 1, paddingTop: '24px' }}>
        {NAV.map((group) => (
          <div key={group.section} className="app-sidebar-group">
            <div
              className="app-sidebar-section"
              style={{
                padding: '20px 34px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: '16px',
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
                  className="app-sidebar-item"
                  key={item.label}
                  onClick={() => router.push(item.href)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '22px',
                    width: '100%',
                    padding: '16px 34px',
                    background: active ? 'rgba(230,57,70,0.18)' : 'none',
                    border: 'none',
                    borderLeft: active ? '2px solid #e63946' : '2px solid transparent',
                    cursor: 'pointer',
                    color: '#ffffff',
                    fontSize: '22px',
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
                  <span style={{ fontSize: '22px', opacity: active ? 1 : 0.9, lineHeight: 1 }}>□</span>
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}

        {/* Admin section */}
        {isAdmin && (
          <div className="app-sidebar-group app-sidebar-admin-group">
            <div
              className="app-sidebar-section"
              style={{
                padding: '20px 34px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: '16px',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: '#e63946',
                opacity: 0.8,
              }}
            >
              Admin
            </div>
            {[
              { label: 'Media Manager', href: '/admin/profile' },
              { label: 'Generate', href: '/admin/generate' },
            ].map((item) => {
              const active = isActive(item.href);
              return (
                <button
                  className="app-sidebar-item"
                  key={item.label}
                  onClick={() => router.push(item.href)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '22px',
                    width: '100%',
                    padding: '16px 34px',
                    background: active ? 'rgba(230,57,70,0.18)' : 'none',
                    border: 'none',
                    borderLeft: active ? '2px solid #e63946' : '2px solid transparent',
                    cursor: 'pointer',
                    color: '#ffffff',
                    fontSize: '22px',
                    fontFamily: 'var(--font-body)',
                    fontWeight: active ? 500 : 400,
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '22px', opacity: active ? 1 : 0.9, lineHeight: 1 }}>□</span>
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="app-sidebar-bottom" style={{ borderTop: '1px solid #1e1e1e', padding: '22px 0' }}>
        <button
          className="app-sidebar-item"
          onClick={() => (window.location.href = '/auth/signout')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '22px',
            width: '100%',
            padding: '16px 34px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#ffffff',
            fontSize: '22px',
            fontFamily: 'var(--font-body)',
            opacity: 0.5,
            textAlign: 'left',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.5')}
        >
          <span style={{ fontSize: '22px', lineHeight: 1 }}>□</span> Sign Out
        </button>
      </div>
    </aside>
  );
}
