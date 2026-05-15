'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { archetypes, type Archetype } from '@/lib/archetypes';

// ─── Prompt builder ────────────────────────────────────────────────────────
function buildArchetypePrompt(a: Archetype): string {
  const parts: string[] = [];

  // Physical description from archetype data
  const bioWords = a.bio.toLowerCase();

  // Derive ethnicity hint from archetype data
  parts.push('beautiful African American woman' );

  // Age
  if (a.vector[0] > 0.7) parts.push('late 20s to early 30s');
  else if (a.vector[1] > 0.8) parts.push('mid 30s');
  else parts.push('30s');

  // Style from archetype
  parts.push(a.style.toLowerCase());

  // Vibe / energy
  parts.push(a.vibe.toLowerCase());

  // Scene/mood built from archetype energy
  const energy = a.energy.toLowerCase();
  if (energy.includes('gritty') || energy.includes('street')) {
    parts.push('urban night setting, dramatic lighting, leather jacket, gold jewelry');
  } else if (energy.includes('cerebral') || energy.includes('composed')) {
    parts.push('modern minimalist office, soft natural light, sophisticated');
  } else if (energy.includes('soulful') || energy.includes('mystical')) {
    parts.push('warm candlelight, natural setting, flowing fabric, ethereal atmosphere');
  } else if (energy.includes('kinetic') || energy.includes('explosive')) {
    parts.push('dynamic pose, bold colors, confident stance');
  } else if (energy.includes('controlled') || energy.includes('strategic')) {
    parts.push('power setting, dramatic shadows, commanding presence');
  } else if (energy.includes('tender') || energy.includes('still')) {
    parts.push('soft warm light, peaceful expression, gentle atmosphere');
  } else if (energy.includes('precise') || energy.includes('evolving')) {
    parts.push('professional setting, sharp lighting, elegant composition');
  } else if (energy.includes('sensual') || energy.includes('deliberate')) {
    parts.push('warm luxurious setting, rich colors, sophisticated atmosphere');
  } else if (energy.includes('fire') || energy.includes('unwavering')) {
    parts.push('strong confident pose, bold dramatic lighting, powerful presence');
  } else {
    parts.push('beautiful natural lighting, confident expression');
  }

  // Core quality tags — always appended
  parts.push(
    'photorealistic portrait',
    'sharp focus',
    'professional photography',
    'cinematic lighting',
    'high detail skin texture',
    'natural hair',
    'looking at camera',
    '4k quality',
  );

  return parts.join(', ');
}

// ─── Types ─────────────────────────────────────────────────────────────────
type GenerationStatus = 'idle' | 'generating' | 'done' | 'error' | 'skipped';

type ArchetypeState = {
  archetype: Archetype;
  status: GenerationStatus;
  imageUrl: string | null;
  error: string | null;
  seed: number | null;
  // prompt text (if present for this archetype)
  savedPrompt?: string | null;
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
  const [promptMap, setPromptMap] = useState<Record<string, string>>({});
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
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
      // Load saved prompts for archetypes
      fetch('/api/archetypes/prompts')
        .then((r) => r.json())
        .then(({ prompts }: { prompts?: Record<string, string> }) => {
          if (prompts) setPromptMap(prompts);
        })
        .catch(() => {});
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
          style: 'portrait',
          num_inference_steps: 28,
          guidance_scale: 7.0,
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

  const [editedPrompt, setEditedPrompt] = useState('');

  useEffect(() => {
    if (!activePromptId) return;
    const saved = promptMap[activePromptId];
    if (saved) setEditedPrompt(saved);
    else {
      const found = archetypes.find((a) => a.id === activePromptId);
      setEditedPrompt(found ? buildArchetypePrompt(found) : '');
    }
  }, [activePromptId, promptMap]);

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
          <button
            onClick={() => router.push('/admin/archetypes')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-muted)', padding: 0, marginLeft: '12px' }}
          >
            ✎ Edit Prompts
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
                {/* Clickable image — opens prompt editor drawer */}
                <div style={{ position: 'relative' }}>
                  <div
                    onClick={() => setActivePromptId(s.archetype.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit prompt for ${s.archetype.name}`}
                    style={{
                      aspectRatio: '3/4',
                      background: s.imageUrl ? 'var(--onyx)' : s.archetype.imageGradient,
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: 'pointer',
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
                  </div>
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

      {/* Prompt editor drawer */}
      {activePromptId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
          <div
            onClick={() => setActivePromptId(null)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }}
          />
          <div style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: '420px', background: 'var(--charcoal)', borderLeft: '1px solid var(--border-dark)', padding: '20px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--ivory)' }}>Edit Prompt</div>
              <button onClick={() => setActivePromptId(null)} style={{ background: 'none', border: 'none', color: 'var(--ivory-muted)', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ivory-muted)', marginBottom: '8px' }}>{activePromptId}</div>

            <textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              rows={12}
              style={{ width: '100%', padding: '12px', background: 'var(--onyx)', border: '1px solid var(--border-mid)', borderRadius: '3px', color: 'var(--ivory)', fontFamily: 'var(--font-mono)', fontSize: '12px', resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                onClick={async () => {
                  const id = activePromptId!;
                  const imageUrl = existingImages[id] ?? null;
                  if (!imageUrl) {
                    alert('No image present yet — save will succeed after an image exists.');
                    setPromptMap((p) => ({ ...p, [id]: editedPrompt }));
                    return;
                  }

                  try {
                    const res = await fetch('/api/archetypes/images/save', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ archetype_id: id, image_url: imageUrl, prompt_used: editedPrompt, style: 'portrait' }),
                    });
                    if (!res.ok) throw new Error('Save failed');
                    setPromptMap((p) => ({ ...p, [id]: editedPrompt }));
                    alert('Prompt saved');
                  } catch (e) {
                    alert('Save failed');
                  }
                }}
                style={{ padding: '10px 14px', background: 'var(--gold)', border: 'none', borderRadius: '3px', cursor: 'pointer', color: 'var(--onyx)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              >
                ◈ Save Prompt
              </button>

              <button
                onClick={async () => {
                  const id = activePromptId!;
                  const prompt = editedPrompt.trim();
                  if (!prompt) { alert('Prompt is empty'); return; }

                  try {
                    const genRes = await fetch('/api/generate-companion', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ description: prompt, style: 'portrait', num_inference_steps: 28, guidance_scale: 7.0, seed: -1 }),
                    });
                    const genData = await genRes.json();
                    if (!genRes.ok || !genData.image_url) throw new Error(genData.error || 'Generation failed');

                    // Save image URL + prompt
                    const saveRes = await fetch('/api/archetypes/images/save', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ archetype_id: id, image_url: genData.image_url, seed: genData.seed ?? null, prompt_used: prompt, style: 'portrait' }),
                    });
                    if (!saveRes.ok) throw new Error('Save failed');

                    // Update local state
                    setExistingImages((prev) => ({ ...prev, [id]: genData.image_url }));
                    setStates((prev) => prev.map((st) => st.archetype.id === id ? { ...st, imageUrl: genData.image_url, status: 'done', seed: genData.seed ?? null } : st));
                    setPromptMap((p) => ({ ...p, [id]: prompt }));
                    alert('Saved and regenerated');
                  } catch (e) {
                    alert('Regeneration failed');
                  }
                }}
                style={{ padding: '10px 14px', background: 'transparent', border: '1px solid var(--gold-dim)', borderRadius: '3px', cursor: 'pointer', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              >
                ◆ Save & Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}