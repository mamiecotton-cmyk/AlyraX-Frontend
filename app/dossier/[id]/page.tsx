'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { archetypes, buildArchetypePrompt, NEGATIVE_PROMPT } from '@/lib/archetypes';

// ─── Types ─────────────────────────────────────────────────────────────────
type GenerationStatus = 'idle' | 'generating' | 'done' | 'error' | 'skipped';

type ArchetypeState = {
  archetype: Archetype;
  status: GenerationStatus;
  imageUrl: string | null;
  error: string | null;
  seed: number | null;
};

// ─── Component ─────────────────────────────────────────────────────────────
export default function AdminGeneratePage() {
  const router = useRouter();
  const supabase = createClient();

  const [authed, setAuthed]       = useState(false);
  const [checking, setChecking]   = useState(true);
  const [running, setRunning]     = useState(false);
  const [states, setStates]       = useState<ArchetypeState[]>(
    archetypes.map((a) => ({ archetype: a, status: 'idle', imageUrl: null, error: null, seed: null })),
  );
  const [existingImages, setExistingImages] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex]     = useState<number | null>(null);
  const [overwrite, setOverwrite]           = useState(false);

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return; }
      setAuthed(true);
      setChecking(false);
    });
  }, [router, supabase]);

  // Load existing images on mount
  useEffect(() => {
    if (!authed) return;
    fetch('/api/archetypes/images')
      .then((r) => r.json())
      .then(({ images }) => {
        setExistingImages(images || {});
        setStates((prev) => prev.map((s) => ({
          ...s,
          status: images?.[s.archetype.id] ? 'done' : 'idle',
          imageUrl: images?.[s.archetype.id] || null,
        })));
      });
  }, [authed]);

  function updateState(id: string, patch: Partial<ArchetypeState>) {
    setStates((prev) => prev.map((s) => s.archetype.id === id ? { ...s, ...patch } : s));
  }

  async function generateOne(state: ArchetypeState): Promise<boolean> {
    const { archetype } = state;

    // Skip if already done and not overwriting
    if (!overwrite && existingImages[archetype.id]) {
      updateState(archetype.id, { status: 'skipped', imageUrl: existingImages[archetype.id] });
      return true;
    }

    updateState(archetype.id, { status: 'generating', error: null });

    const prompt = buildArchetypePrompt(archetype);

    try {
      // Call the existing generate-companion route
      const genRes = await fetch('/api/generate-companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: prompt,
          negative_prompt: NEGATIVE_PROMPT,
          style: 'portrait',
          num_inference_steps: 35,
          guidance_scale: 7.5,
          seed: -1,
        }),
      });

      const genData = await genRes.json();

      if (!genRes.ok || !genData.image_url) {
        throw new Error(genData.error || 'Generation failed');
      }

      const imageUrl: string = genData.image_url;
      const seed: number = genData.seed ?? -1;

      // Save to archetype_images table
      const saveRes = await fetch('/api/archetypes/images/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archetype_id: archetype.id,
          image_url: imageUrl,
          seed,
          prompt_used: prompt,
          style: 'portrait',
        }),
      });

      if (!saveRes.ok) throw new Error('Failed to save image URL');

      updateState(archetype.id, { status: 'done', imageUrl, seed });
      setExistingImages((prev) => ({ ...prev, [archetype.id]: imageUrl }));
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      updateState(archetype.id, { status: 'error', error: msg });
      return false;
    }
  }

  async function runAll() {
    setRunning(true);

    for (let i = 0; i < archetypes.length; i++) {
      setCurrentIndex(i);
      const state = states[i];

      // Small delay between generations to avoid hammering RunPod
      if (i > 0) await new Promise((r) => setTimeout(r, 1500));

      await generateOne(state);
    }

    setCurrentIndex(null);
    setRunning(false);
  }

  async function runSingle(id: string) {
    const state = states.find((s) => s.archetype.id === id);
    if (!state || running) return;
    setRunning(true);
    setCurrentIndex(states.findIndex((s) => s.archetype.id === id));
    await generateOne({ ...state, status: 'idle' });
    setCurrentIndex(null);
    setRunning(false);
  }

  const done    = states.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const errors  = states.filter((s) => s.status === 'error').length;
  const pending = states.filter((s) => s.status === 'idle').length;

  if (checking) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--onyx)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.3em', color: 'var(--ivory-ghost)', textTransform: 'uppercase' }}>
          Verifying access...
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', width: '100%', background: 'var(--onyx)', padding: '32px' }}>

      {/* Header */}
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '6px' }}>
              ◈ Admin — Image Generation
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--ivory)', marginBottom: '6px' }}>
              Archetype Portrait Generator
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ivory-muted)' }}>
              Generates photorealistic portraits for all 20 archetypes using your RunPod pipeline.
            </div>
          </div>

          <button
            onClick={() => router.push('/dashboard')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-muted)', padding: 0 }}
          >
            ◁ Dashboard
          </button>
        </div>

        {/* Stats bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          {[
            { label: 'Total', val: 20, color: 'var(--ivory-dim)' },
            { label: 'Complete', val: done, color: '#27ae60' },
            { label: 'Pending', val: pending, color: 'var(--gold)' },
            { label: 'Errors', val: errors, color: '#c0392b' },
          ].map((s) => (
            <div
              key={s.label}
              style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '12px 16px' }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '4px' }}>
                {s.label}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '24px', color: s.color }}>
                {s.val}
              </div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ height: '2px', background: 'var(--border-dark)', borderRadius: '1px', marginBottom: '20px' }}>
          <div
            style={{
              height: '2px',
              background: 'var(--gold)',
              width: `${(done / 20) * 100}%`,
              borderRadius: '1px',
              transition: 'width 0.5s ease',
            }}
          />
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
          <button
            onClick={runAll}
            disabled={running}
            style={{
              padding: '10px 24px',
              background: running ? 'var(--border-mid)' : 'var(--gold)',
              border: 'none',
              borderRadius: '2px',
              cursor: running ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: running ? 'var(--ivory-muted)' : 'var(--onyx)',
              fontWeight: 500,
              transition: 'all 0.15s',
            }}
          >
            {running ? `◈ Generating ${(currentIndex ?? 0) + 1} / 20...` : '◈ Generate All 20'}
          </button>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--ivory-muted)',
            }}
          >
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              style={{ accentColor: 'var(--gold)', width: '14px', height: '14px' }}
            />
            Overwrite existing
          </label>

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', color: 'var(--ivory-ghost)' }}>
            Each image takes ~2–4 min via RunPod
          </div>
        </div>

        {/* Gold rule */}
        <div style={{ height: '1px', background: 'linear-gradient(90deg, var(--gold) 0%, transparent 100%)', marginBottom: '24px' }} />

        {/* Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '12px',
          }}
        >
          {states.map((s, i) => {
            const isActive = currentIndex === i;
            const statusColor = {
              idle: 'var(--ivory-ghost)',
              generating: 'var(--gold)',
              done: '#27ae60',
              error: '#c0392b',
              skipped: '#7a7a6a',
            }[s.status];

            return (
              <div
                key={s.archetype.id}
                style={{
                  background: 'var(--charcoal)',
                  border: `1px solid ${isActive ? 'var(--gold)' : s.status === 'error' ? 'rgba(192,57,43,0.4)' : s.status === 'done' || s.status === 'skipped' ? 'rgba(39,174,96,0.25)' : 'var(--border-dark)'}`,
                  borderRadius: '3px',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Image area */}
                <div
                  style={{
                    aspectRatio: '3/4',
                    background: s.imageUrl ? 'var(--onyx)' : s.archetype.imageGradient,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {s.imageUrl ? (
                    <img
                      src={s.imageUrl}
                      alt={s.archetype.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      {isActive ? (
                        <>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', color: 'var(--gold)', animation: 'spin 2s linear infinite' }}>◈</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.14em', color: 'var(--gold)', textTransform: 'uppercase' }}>Generating...</div>
                        </>
                      ) : (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ivory-ghost)', opacity: 0.4 }}>◈</div>
                      )}
                    </div>
                  )}

                  {/* Status badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '7.5px',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: statusColor,
                      background: 'rgba(0,0,0,0.8)',
                      padding: '2px 7px',
                      borderRadius: '2px',
                      border: `1px solid ${statusColor}40`,
                    }}
                  >
                    {s.status === 'skipped' ? 'cached' : s.status}
                  </div>

                  {/* Dossier ID */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '7.5px',
                      letterSpacing: '0.14em',
                      color: 'var(--ivory-ghost)',
                      background: 'rgba(0,0,0,0.7)',
                      padding: '2px 6px',
                      borderRadius: '2px',
                    }}
                  >
                    {s.archetype.dossierId}
                  </div>
                </div>

                {/* Card body */}
                <div style={{ padding: '10px 12px 12px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: 'var(--ivory)', marginBottom: '2px' }}>
                    {s.archetype.name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '8px' }}>
                    {s.archetype.archetype}
                  </div>

                  {s.status === 'error' && (
                    <div style={{ fontSize: '10px', color: '#c0392b', marginBottom: '8px', lineHeight: 1.4 }}>
                      {s.error}
                    </div>
                  )}

                  {s.seed && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', color: 'var(--ivory-ghost)', marginBottom: '8px' }}>
                      seed {s.seed}
                    </div>
                  )}

                  <button
                    onClick={() => runSingle(s.archetype.id)}
                    disabled={running}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '6px 0',
                      textAlign: 'center',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '8px',
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: running ? 'var(--ivory-ghost)' : 'var(--gold)',
                      background: 'transparent',
                      border: '1px solid ' + (running ? 'var(--border-dark)' : 'var(--gold-dim)'),
                      borderRadius: '2px',
                      cursor: running ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {isActive ? '◈ Working...' : s.status === 'done' || s.status === 'skipped' ? '↺ Regenerate' : '◆ Generate'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div
          style={{
            marginTop: '32px',
            padding: '16px 20px',
            background: 'var(--charcoal)',
            border: '1px solid var(--border-dark)',
            borderRadius: '3px',
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            letterSpacing: '0.12em',
            color: 'var(--ivory-muted)',
            lineHeight: 1.7,
          }}
        >
          ◈ Images are generated sequentially to avoid overloading RunPod. Each portrait takes 2–4 minutes.<br />
          ◈ Generated images are saved to Supabase Storage and the URL is recorded in the <code style={{ color: 'var(--gold)' }}>archetype_images</code> table.<br />
          ◈ The dossier cards and archive will automatically show real portraits once generated.<br />
          ◈ Use "Regenerate" on any card to redo a single portrait without affecting others.
        </div>

      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}