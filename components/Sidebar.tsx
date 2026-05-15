'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

type NavItem = {
  label: string;
  icon: string;
  href?: string;
  children?: { label: string; icon: string; href: string }[];
};

const NAV: NavItem[] = [
  {
    label: 'Identity Sync',
    icon: '◈',
    children: [
      { label: 'Pulse Quiz', icon: '◆', href: '/pulse-quiz' },
      { label: 'Your Match', icon: '◇', href: '/match' },
    ],
  },
  {
    label: 'Active Dossiers',
    icon: '▣',
    children: [
      { label: 'The Men', icon: '△', href: '/archive?gender=M' },
      { label: 'The Women', icon: '▽', href: '/archive?gender=F' },
    ],
  },
  {
    label: 'The Archive',
    icon: '◉',
    children: [
      { label: 'All 20 Archetypes', icon: '○', href: '/archive' },
      { label: 'Video Sessions', icon: '▷', href: '/create' },
      { label: 'Image Gallery', icon: '□', href: '/create' },
    ],
  },
];

const BOTTOM_NAV = [
  { label: 'Account Settings', icon: '◎', href: '/settings' },
  { label: 'Credits', icon: '◐', href: '/credits' },
  { label: 'Sign Out', icon: '◁', href: '/auth/signout' },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<string[]>(['Identity Sync', 'Active Dossiers', 'The Archive']);

  const toggle = (label: string) => {
    setExpanded((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '?');

  return (
    <aside
      style={{
        width: '220px',
        minWidth: '220px',
        background: 'var(--charcoal)',
        borderRight: '1px solid var(--border-dark)',
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
          borderBottom: '1px solid var(--border-dark)',
        }}
      >
        <button
          onClick={() => router.push('/dashboard')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '22px',
              fontWeight: 500,
              color: 'var(--gold)',
              letterSpacing: '0.1em',
              lineHeight: 1,
            }}
          >
            ALYRA X
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '8px',
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: 'var(--ivory-ghost)',
              marginTop: '4px',
            }}
          >
            Private Archive
          </div>
        </button>
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, paddingTop: '8px' }}>
        {NAV.map((section) => {
          const isOpen = expanded.includes(section.label);
          return (
            <div key={section.label}>
              <button
                onClick={() => toggle(section.label)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '10px 20px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--ivory-dim)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  letterSpacing: '0.06em',
                  textAlign: 'left',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--ivory)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--ivory-dim)')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: 'var(--gold)', fontSize: '12px', opacity: 0.7 }}>{section.icon}</span>
                  {section.label}
                </span>
                <span
                  style={{
                    fontSize: '8px',
                    color: 'var(--ivory-ghost)',
                    transition: 'transform 0.2s',
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                    display: 'inline-block',
                  }}
                >
                  ▾
                </span>
              </button>

              {isOpen && section.children && (
                <div>
                  {section.children.map((child) => {
                    const active = child.href ? isActive(child.href) : false;
                    return (
                      <button
                        key={child.label}
                        onClick={() => child.href && router.push(child.href)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          width: '100%',
                          padding: '7px 20px 7px 40px',
                          background: active ? 'var(--gold-glow)' : 'none',
                          border: 'none',
                          borderLeft: active ? '2px solid var(--gold)' : '2px solid transparent',
                          cursor: 'pointer',
                          color: active ? 'var(--gold)' : 'var(--ivory-muted)',
                          fontSize: '11.5px',
                          fontFamily: 'var(--font-body)',
                          fontWeight: active ? 500 : 400,
                          textAlign: 'left',
                          letterSpacing: '0.02em',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--ivory-dim)';
                        }}
                        onMouseLeave={(e) => {
                          if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--ivory-muted)';
                        }}
                      >
                        <span style={{ fontSize: '8px', opacity: 0.5 }}>{child.icon}</span>
                        {child.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Divider */}
        <div style={{ height: '1px', background: 'var(--border-dark)', margin: '12px 0' }} />

        {/* Section label */}
        <div
          style={{
            padding: '4px 20px 8px',
            fontFamily: 'var(--font-mono)',
            fontSize: '8px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--ivory-ghost)',
          }}
        >
          Clearance
        </div>

        {/* Gold access badge */}
        <div style={{ padding: '0 20px 12px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              border: '1px solid var(--gold-dim)',
              borderRadius: '2px',
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--gold)',
            }}
          >
            <span style={{ fontSize: '8px' }}>◈</span>
            Gold Access
          </div>
        </div>
      </nav>

      {/* Bottom nav */}
      <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '8px', paddingBottom: '8px' }}>
        {BOTTOM_NAV.map((item) => (
          <button
            key={item.label}
            onClick={() => item.href && (item.href === '/auth/signout'
              ? (window.location.href = item.href)
              : router.push(item.href))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '8px 20px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ivory-muted)',
              fontSize: '11px',
              fontFamily: 'var(--font-body)',
              textAlign: 'left',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--ivory-dim)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--ivory-muted)')}
          >
            <span style={{ color: 'var(--gold)', fontSize: '11px', opacity: 0.5 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </aside>
  );
}