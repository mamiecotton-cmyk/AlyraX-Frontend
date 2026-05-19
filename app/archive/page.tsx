'use client';

import { useState, useMemo, Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import ArchetypeCard from '@/components/ArchetypeCard';
import { archetypes } from '@/lib/archetypes';

type Filter = 'all' | 'M' | 'F';

function ArchiveContent() {
  const searchParams = useSearchParams();
  const rawGender = searchParams.get('gender');
  const initialGender: Filter = (rawGender === 'M' || rawGender === 'F') ? rawGender : 'all';

  const [filter, setFilter] = useState<Filter>(initialGender);
  const [search, setSearch]   = useState('');
  const [archetypeImages, setArchetypeImages] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/archetypes/images')
      .then((r) => r.json())
      .then(({ images }) => setArchetypeImages(images || {}))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    let pool = archetypes;
    if (filter !== 'all') pool = pool.filter((a) => a.gender === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      pool = pool.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.archetype.toLowerCase().includes(q) ||
          a.vibe.toLowerCase().includes(q) ||
          a.dossierId.includes(q),
      );
    }
    return pool;
  }, [filter, search]);

  return (
    <div className="app-shell theme-dark" style={{ display: 'flex', width: '100%', height: '100dvh', overflow: 'hidden' }}>
      <Sidebar />

      <main
        className="app-main"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100dvh',
          overflow: 'hidden',
          background: 'var(--onyx)',
        }}
      >
        {/* Top bar */}
        <header
          className="app-topbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 28px',
            borderBottom: '1px solid var(--border-dark)',
            background: 'var(--charcoal-mid)',
            flexShrink: 0,
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '14px', color: 'var(--ivory)', letterSpacing: '0.04em' }}>
            The Archive — All Archetypes
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--ivory-muted)', textTransform: 'uppercase' }}>
            {filtered.length} / 20 Dossiers
          </div>
        </header>

        <div className="app-content" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

          {/* Controls row */}
          <div
            className="app-controls-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            {/* Filters */}
            <div className="app-segment-row" style={{ display: 'flex', gap: '4px' }}>
              {(['all', 'M', 'F'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '7px 16px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: filter === f ? '#0a0a0a' : '#ffffff',
                    background: filter === f ? 'var(--gold)' : 'transparent',
                    border: '1px solid ' + (filter === f ? 'var(--gold)' : 'var(--border-mid)'),
                    borderRadius: '2px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {f === 'all' ? '◉ All 20' : f === 'M' ? '△ The Men' : '▽ The Women'}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              className="app-search-input"
              type="text"
              placeholder="Search by name, archetype, vibe..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: '7px 14px',
                background: 'var(--charcoal)',
                border: '1px solid var(--border-mid)',
                borderRadius: '2px',
                color: 'var(--ivory)',
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                outline: 'none',
                width: '260px',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--gold-dim)')}
              onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--border-mid)')}
            />
          </div>

          <div className="gold-rule" style={{ marginBottom: '22px' }} />

          {filtered.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                fontFamily: 'var(--font-display)',
                fontSize: '16px',
                fontStyle: 'italic',
                color: 'var(--ivory-ghost)',
              }}
            >
              No dossiers match that query.
            </div>
          ) : (
            <div
              className="archetype-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))',
                gap: '12px',
              }}
            >
              {filtered.map((a, i) => (
                <ArchetypeCard key={a.id} archetype={a} delay={i * 0.03} imageUrl={archetypeImages[a.id] || null} />
              ))}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

export default function ArchivePage() {
  return (
    <Suspense fallback={<div className="theme-dark" style={{ background: 'var(--onyx)', color: 'var(--ivory-ghost)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.3em' }}>LOADING...</div>}>
      <ArchiveContent />
    </Suspense>
  );
}
