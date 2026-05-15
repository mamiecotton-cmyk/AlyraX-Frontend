'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { archetypes, type Archetype } from '@/lib/archetypes';

type Props = {
  params: Promise<{ id: string }>;
};

export default function DossierPage({ params }: Props) {
  const { id } = use(params);
  const router  = useRouter();
  const archetype = archetypes.find((a) => a.id === id);

  useEffect(() => {
    let mounted = true;
    fetch('/api/auth/me').then((r) => r.json()).then((d) => {
      if (!mounted) return;
      if (!d?.user) { router.push('/login'); return; }
      if (!d?.is_admin) { router.push('/login'); return; }
    }).catch(() => { if (mounted) router.push('/login'); });
    return () => { mounted = false };
  }, [router]);

  const [activeTab, setActiveTab] = useState<'profile' | 'conversation' | 'gallery'>('profile');
  const [archetypeImage, setArchetypeImage] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<{ id: string; image_url: string; is_main: boolean }[]>([]);

  useEffect(() => {
    fetch('/api/archetypes/images')
      .then((r) => r.json())
      .then(({ images }) => setArchetypeImage(images?.[id] || null));

    fetch(`/api/archetypes/gallery?archetype_id=${id}`)
      .then((r) => r.json())
      .then(({ images }) => { if (images?.length) setGalleryImages(images); })
      .catch(() => {});
  }, [id]);

  if (!archetype) {
    return (
      <div style={{ display: 'flex', width: '100%', height: '100dvh', background: 'var(--onyx)', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '12px' }}>Dossier Not Found</div>
          <button onClick={() => router.push('/archive')} className="btn-ghost">◁ Return to Archive</button>
        </div>
      </div>
    );
  }

  const TABS = ['profile', 'conversation', 'gallery'] as const;

  // Personality bars — derived from the 5-dim vector
  const dims = [
    { label: 'Intensity',   val: archetype.vector[0] },
    { label: 'Warmth',      val: archetype.vector[1] },
    { label: 'Intellect',   val: archetype.vector[2] },
    { label: 'Street',      val: archetype.vector[3] },
    { label: 'Dominance',   val: archetype.vector[4] },
  ];

  return (
    <div style={{ display: 'flex', width: '100%', height: '100dvh', overflow: 'hidden' }}>
      <Sidebar />

      <main
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => router.push('/archive')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--ivory-muted)',
                padding: 0,
              }}
            >
              ◁ Archive
            </button>
            <span style={{ color: 'var(--ivory-ghost)', fontSize: '10px' }}>—</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', color: 'var(--ivory)', letterSpacing: '0.04em' }}>
              {archetype.name}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                letterSpacing: '0.18em',
                color: 'var(--gold)',
                background: 'rgba(212,175,55,0.08)',
                padding: '2px 8px',
                borderRadius: '2px',
                border: '1px solid var(--gold-dim)',
              }}
            >
              {archetype.dossierId}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => router.push('/onboarding')}
              className="btn-gold"
            >
              ◆ Activate Companion
            </button>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: '100%' }}>

            {/* Left — portrait + vitals */}
            <div
              style={{
                borderRight: '1px solid var(--border-dark)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Portrait */}
              <div
                className="portrait-frame scan-lines"
                style={{
                  height: '380px',
                  background: archetype.imageGradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  flexShrink: 0,
                }}
              >
                {/* Real portrait or silhouette placeholder */}
                {archetypeImage ? (
                  <img
                    src={archetypeImage}
                    alt={archetype.name}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', zIndex: 0 }}
                  />
                ) : (
                  <svg width="80" height="130" viewBox="0 0 80 130" fill="none" aria-hidden="true" style={{ opacity: 0.25, zIndex: 0 }}>
                    <circle cx="40" cy="32" r="22" fill={archetype.accentColor} />
                    <path d="M8 120 C8 82 72 82 72 120" stroke={archetype.accentColor} strokeWidth="1.5" fill="none" />
                  </svg>
                )}

                {/* Corner decorations */}
                <div style={{ position: 'absolute', top: '10px', left: '10px', width: '16px', height: '16px', borderTop: '1px solid var(--gold)', borderLeft: '1px solid var(--gold)', zIndex: 2 }} />
                <div style={{ position: 'absolute', top: '10px', right: '10px', width: '16px', height: '16px', borderTop: '1px solid var(--gold)', borderRight: '1px solid var(--gold)', zIndex: 2 }} />
                <div style={{ position: 'absolute', bottom: '10px', left: '10px', width: '16px', height: '16px', borderBottom: '1px solid var(--gold)', borderLeft: '1px solid var(--gold)', zIndex: 2 }} />
                <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '16px', height: '16px', borderBottom: '1px solid var(--gold)', borderRight: '1px solid var(--gold)', zIndex: 2 }} />

                {/* Name overlay at bottom */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '20px 16px 16px',
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
                    zIndex: 2,
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '3px' }}>
                    {archetype.dossierId}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 500, color: 'var(--ivory)', lineHeight: 1 }}>
                    {archetype.name}
                  </div>
                </div>
              </div>

              {/* Vital stats panel */}
              <div style={{ padding: '18px', flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '14px' }}>
                  ◈ Vital Statistics
                </div>

                {[
                  { label: 'Location',    val: archetype.city },
                  { label: 'Age',         val: `${archetype.age} years old` },
                  { label: 'Archetype',   val: archetype.archetype },
                  { label: 'Energy',      val: archetype.energy },
                  { label: 'Vibe',        val: archetype.vibe },
                  { label: 'Style',       val: archetype.style },
                  { label: 'Background',  val: archetype.background },
                ].map((s) => (
                  <div key={s.label} style={{ marginBottom: '12px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '3px' }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ivory-dim)', lineHeight: 1.45 }}>
                      {s.val}
                    </div>
                  </div>
                ))}

                {/* Gold rule */}
                <div className="gold-rule" style={{ margin: '16px 0' }} />

                {/* Personality bars */}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '12px' }}>
                  ◈ Personality Vector
                </div>

                {dims.map((d) => (
                  <div key={d.label} style={{ marginBottom: '9px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-muted)' }}>
                        {d.label}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', color: 'var(--ivory-ghost)' }}>
                        {Math.round(d.val * 100)}
                      </span>
                    </div>
                    <div style={{ height: '2px', background: 'var(--border-mid)', borderRadius: '1px' }}>
                      <div
                        style={{
                          height: '2px',
                          background: 'var(--gold)',
                          width: `${d.val * 100}%`,
                          borderRadius: '1px',
                          transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — tabs + content */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>

              {/* Tab bar */}
              <div
                style={{
                  display: 'flex',
                  borderBottom: '1px solid var(--border-dark)',
                  background: 'var(--charcoal-mid)',
                  flexShrink: 0,
                }}
              >
                {TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '12px 22px',
                      background: 'none',
                      border: 'none',
                      borderBottom: tab === activeTab ? '1px solid var(--gold)' : '1px solid transparent',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9px',
                      letterSpacing: '0.18em',
                      textTransform: 'capitalize',
                      color: tab === activeTab ? 'var(--gold)' : 'var(--ivory-muted)',
                      transition: 'color 0.15s',
                    }}
                  >
                    {tab === 'profile' ? '◈ Profile' : tab === 'conversation' ? '◎ First Spark' : '□ Gallery'}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, padding: '28px', overflowY: 'auto' }}>

                {activeTab === 'profile' && (
                  <div className="fade-in">
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '12px' }}>
                      ◈ Dossier Profile
                    </div>

                    {/* Quote */}
                    <blockquote
                      style={{
                        padding: '18px 20px',
                        borderLeft: '2px solid var(--gold)',
                        background: 'var(--gold-glow)',
                        borderRadius: '0 3px 3px 0',
                        marginBottom: '24px',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '17px',
                          fontStyle: 'italic',
                          color: 'var(--ivory)',
                          lineHeight: 1.6,
                          fontWeight: 300,
                        }}
                      >
                        {archetype.quote}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.16em', color: 'var(--gold)', marginTop: '10px', textTransform: 'uppercase' }}>
                        — {archetype.name}
                      </div>
                    </blockquote>

                    {/* Bio */}
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '10px' }}>
                      Background
                    </div>
                    <p
                      style={{
                        fontSize: '13.5px',
                        color: 'var(--ivory-dim)',
                        lineHeight: 1.75,
                        marginBottom: '28px',
                      }}
                    >
                      {archetype.bio}
                    </p>

                    {/* Tagline */}
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 14px',
                        border: '1px solid var(--gold-dim)',
                        borderRadius: '2px',
                        fontFamily: 'var(--font-display)',
                        fontSize: '13px',
                        fontStyle: 'italic',
                        color: 'var(--gold)',
                      }}
                    >
                      <span style={{ fontSize: '9px', opacity: 0.6 }}>◈</span>
                      {archetype.tagline}
                    </div>
                  </div>
                )}

                {activeTab === 'conversation' && (
                  <div className="fade-in">
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '20px' }}>
                      ◈ First Spark — Simulated Opening
                    </div>

                    {/* Simulated chat */}
                    <div style={{ maxWidth: '480px' }}>
                      {/* Companion bubble */}
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            border: '1px solid var(--gold-dim)',
                            background: archetype.imageGradient,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            fontFamily: 'var(--font-display)',
                            fontSize: '12px',
                            color: 'var(--gold)',
                          }}
                        >
                          {archetype.name[0]}
                        </div>
                        <div
                          style={{
                            padding: '12px 15px',
                            background: 'var(--charcoal)',
                            border: '1px solid var(--border-mid)',
                            borderRadius: '2px 8px 8px 8px',
                            fontSize: '13px',
                            color: 'var(--ivory)',
                            lineHeight: 1.6,
                            maxWidth: '360px',
                          }}
                        >
                          {archetype.quote.replace(/"/g, '')}
                        </div>
                      </div>

                      {/* User prompt area */}
                      <div
                        style={{
                          padding: '20px',
                          border: '1px dashed var(--border-mid)',
                          borderRadius: '3px',
                          textAlign: 'center',
                          marginTop: '24px',
                        }}
                      >
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontStyle: 'italic', color: 'var(--ivory-ghost)', marginBottom: '14px' }}>
                          Start a real conversation with {archetype.name}
                        </div>
                        <button
                          onClick={() => router.push('/onboarding')}
                          className="btn-gold"
                          style={{ margin: '0 auto' }}
                        >
                          ◆ Activate {archetype.name} as Companion
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'gallery' && (
                  <div className="fade-in">
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '20px' }}>
                      ◈ Portrait Gallery — {galleryImages.length} image{galleryImages.length !== 1 ? 's' : ''}
                    </div>

                    {galleryImages.length === 0 ? (
                      <div style={{ padding: '48px', border: '1px dashed var(--border-mid)', borderRadius: '3px', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '14px', fontStyle: 'italic', color: 'var(--ivory-ghost)' }}>
                        No gallery images yet.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                        {galleryImages.map((img) => (
                          <div
                            key={img.id}
                            style={{
                              aspectRatio: '3/4',
                              background: archetype.imageGradient,
                              border: `1px solid ${img.is_main ? 'var(--gold)' : 'var(--border-dark)'}`,
                              borderRadius: '2px',
                              overflow: 'hidden',
                              position: 'relative',
                            }}
                          >
                            <img src={img.image_url} alt={archetype.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
                            {img.is_main && (
                              <div style={{ position: 'absolute', top: '6px', left: '6px', fontFamily: 'var(--font-mono)', fontSize: '7px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--onyx)', background: 'var(--gold)', padding: '2px 5px', borderRadius: '2px' }}>Main</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}