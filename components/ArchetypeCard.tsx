'use client';

import { useRouter } from 'next/navigation';
import type { Archetype } from '@/lib/archetypes';

type Props = {
  archetype: Archetype;
  featured?: boolean;
  delay?: number;
  imageUrl?: string | null;
};

export default function ArchetypeCard({ archetype, featured = false, delay = 0, imageUrl }: Props) {
  const router = useRouter();

  return (
    <article
      className="card-hover fade-in"
      style={{
        animationDelay: `${delay}s`,
        background: 'var(--charcoal)',
        border: featured ? '1px solid var(--gold)' : '1px solid var(--border-dark)',
        borderRadius: '3px',
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
      }}
      onClick={() => router.push(`/dossier/${archetype.id}`)}
    >
      {/* Portrait area */}
      <div
        style={{
          aspectRatio: '3/4',
          background: archetype.imageGradient,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={archetype.name}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center top',
              display: 'block',
            }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="48" height="80" viewBox="0 0 48 80" fill="none" aria-hidden="true">
              <circle cx="24" cy="20" r="12" fill={archetype.accentColor} opacity="0.4" />
              <path d="M6 72 C6 52 42 52 42 72" stroke={archetype.accentColor} strokeWidth="1" fill="none" opacity="0.3" />
            </svg>
          </div>
        )}

        {/* Gradient overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.75) 100%)', pointerEvents: 'none', zIndex: 1 }} />

        {/* Dossier ID */}
        <div style={{ position: 'absolute', top: '10px', left: '10px', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.18em', color: 'var(--gold)', background: 'rgba(0,0,0,0.7)', padding: '2px 7px', borderRadius: '2px', border: '1px solid rgba(212,175,55,0.25)', zIndex: 2 }}>
          {archetype.dossierId}
        </div>

        {/* Gender */}
        <div style={{ position: 'absolute', top: '10px', right: '10px', fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--ivory-muted)', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '2px', zIndex: 2 }}>
          {archetype.gender === 'M' ? '♂' : '♀'}
        </div>

        {featured && (
          <div style={{ position: 'absolute', bottom: '10px', right: '10px', fontFamily: 'var(--font-mono)', fontSize: '7px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--onyx)', background: 'var(--gold)', padding: '2px 7px', borderRadius: '2px', zIndex: 2 }}>
            Your Match
          </div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: '12px 13px 13px', borderTop: '1px solid var(--border-dark)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 500, color: 'var(--ivory)', marginBottom: '2px' }}>
          {archetype.name}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8.5px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ivory-muted)', marginBottom: '8px' }}>
          {archetype.archetype}
        </div>
        <div style={{ fontSize: '11.5px', color: 'var(--ivory-ghost)', fontStyle: 'italic', lineHeight: 1.45, marginBottom: '11px' }}>
          {archetype.vibe}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/dossier/${archetype.id}`); }}
          style={{
            display: 'block', width: '100%', padding: '7px 0', textAlign: 'center',
            fontFamily: 'var(--font-mono)', fontSize: '8.5px', letterSpacing: '0.18em', textTransform: 'uppercase',
            color: featured ? 'var(--onyx)' : 'var(--gold)',
            background: featured ? 'var(--gold)' : 'transparent',
            border: `1px solid ${featured ? 'var(--gold)' : 'var(--gold-dim)'}`,
            borderRadius: '2px', cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { if (!featured) (e.currentTarget as HTMLButtonElement).style.background = 'var(--gold-hover)'; }}
          onMouseLeave={(e) => { if (!featured) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          Open Dossier
        </button>
      </div>
    </article>
  );
}