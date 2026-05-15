'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const DIMS = ['Intensity', 'Warmth', 'Intellect', 'Street', 'Dominance'];

const GRADIENTS = [
  { label: 'Dark Brown', val: 'linear-gradient(180deg, #1a1410 0%, #0d0b08 60%, #000 100%)' },
  { label: 'Dark Purple', val: 'linear-gradient(180deg, #1a1018 0%, #0f080d 60%, #000 100%)' },
  { label: 'Dark Teal', val: 'linear-gradient(180deg, #101816 0%, #080e0c 60%, #000 100%)' },
  { label: 'Dark Blue', val: 'linear-gradient(180deg, #101418 0%, #080c10 60%, #000 100%)' },
  { label: 'Dark Red', val: 'linear-gradient(180deg, #1a1010 0%, #0d0808 60%, #000 100%)' },
  { label: 'Dark Green', val: 'linear-gradient(180deg, #101810 0%, #080e08 60%, #000 100%)' },
];

const SECTION: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '8px',
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color: 'var(--gold)',
  marginBottom: '12px',
  display: 'block',
};

const LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '7.5px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--ivory-ghost)',
  marginBottom: '5px',
  display: 'block',
};

const INPUT: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '9px 12px',
  background: 'var(--charcoal-mid)',
  border: '1px solid var(--border-mid)',
  borderRadius: '2px',
  color: 'var(--ivory)',
  fontFamily: 'var(--font-body)',
  fontSize: '13px',
  outline: 'none',
  marginBottom: '14px',
};

const TEXTAREA: React.CSSProperties = {
  ...INPUT,
  resize: 'vertical',
  lineHeight: 1.6,
  fontFamily: 'var(--font-body)',
};

export default function NewArchetypePage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    dossierId: '',
    gender: 'F' as 'M' | 'F',
    archetype: '',
    tagline: '',
    quote: '',
    bio: '',
    vibe: '',
    energy: '',
    style: '',
    background: '',
    imageGradient: GRADIENTS[0].val,
    accentColor: '#3a3020',
    vector: [0.5, 0.5, 0.5, 0.5, 0.5],
    prompt: '',
  });

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewSeed, setPreviewSeed]   = useState<number | null>(null);
  const [generating, setGenerating]     = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  function set(key: string, val: unknown) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function setVector(index: number, val: number) {
    setForm((prev) => {
      const v = [...prev.vector];
      v[index] = val;
      return { ...prev, vector: v };
    });
  }

  function buildAutoPrompt() {
    const parts = [
      'RAW photo, analog film photography, shot on Canon EOS R5',
      form.gender === 'M'
        ? 'real African American man, genuine human face, natural skin texture with pores'
        : 'real African American woman, genuine human face, natural skin texture with pores',
      form.vibe && form.vibe.toLowerCase(),
      form.style && form.style.toLowerCase(),
      form.energy && form.energy.toLowerCase(),
      'hyperrealistic, photorealistic, ultra detailed skin, DSLR photo, sharp focus on eyes, cinematic color grade, real person',
    ].filter(Boolean);
    set('prompt', parts.join(', '));
  }

  async function generatePreview() {
    if (!form.prompt.trim()) { setError('Add a prompt first'); return; }
    setError(null);
    setGenerating(true);
    setPreviewImage(null);

    try {
      const res = await fetch('/api/generate-companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.prompt,
          style: 'portrait',
          num_inference_steps: 35,
          guidance_scale: 7.5,
          seed: -1,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.image_url) throw new Error(data.error || 'Generation failed');
      setPreviewImage(data.image_url);
      setPreviewSeed(data.seed ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    }
    setGenerating(false);
  }

  async function handleSave() {
    if (!form.name || !form.archetype || !form.dossierId) {
      setError('Name, Dossier ID, and Archetype Title are required');
      return;
    }
    setError(null);
    setSaving(true);

    try {
      const res = await fetch('/api/archetypes/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dossier_id: form.dossierId,
          name: form.name,
          gender: form.gender,
          archetype: form.archetype,
          tagline: form.tagline,
          quote: form.quote,
          bio: form.bio,
          vibe: form.vibe,
          energy: form.energy,
          style: form.style,
          background: form.background,
          image_gradient: form.imageGradient,
          accent_color: form.accentColor,
          vector: form.vector,
          image_url: previewImage || null,
          prompt_used: form.prompt || null,
          seed: previewSeed || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      router.push('/admin/archetypes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', width: '100%', background: 'var(--onyx)', padding: '32px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '6px' }}>
              ◈ Admin — New Archetype
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', color: 'var(--ivory)' }}>
              Add New Archetype
            </div>
          </div>
          <button
            onClick={() => router.push('/admin/archetypes')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-muted)', padding: 0 }}
          >
            ◁ Back
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>

          {/* Left — form */}
          <div>

            {/* Identity */}
            <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '20px', marginBottom: '12px' }}>
              <span style={SECTION}>◈ Identity</span>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={LABEL}>Name *</span>
                  <input style={INPUT} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Phoenix" />
                </div>
                <div>
                  <span style={LABEL}>Dossier ID *</span>
                  <input style={INPUT} value={form.dossierId} onChange={(e) => set('dossierId', e.target.value)} placeholder="#021" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={LABEL}>Archetype Title *</span>
                  <input style={INPUT} value={form.archetype} onChange={(e) => set('archetype', e.target.value)} placeholder="The Revolutionary" />
                </div>
                <div>
                  <span style={LABEL}>Gender</span>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                    {(['F', 'M'] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => set('gender', g)}
                        style={{
                          flex: 1, padding: '9px', border: `1px solid ${form.gender === g ? 'var(--gold)' : 'var(--border-mid)'}`,
                          background: form.gender === g ? 'var(--gold-glow)' : 'transparent',
                          borderRadius: '2px', cursor: 'pointer',
                          fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em',
                          color: form.gender === g ? 'var(--gold)' : 'var(--ivory-muted)',
                        }}
                      >
                        {g === 'F' ? '▽ Woman' : '△ Man'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <span style={LABEL}>Tagline</span>
              <input style={INPUT} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="She burned down what didn't serve her people." />

              <span style={LABEL}>Quote</span>
              <input style={INPUT} value={form.quote} onChange={(e) => set('quote', e.target.value)} placeholder='"Comfort was never the goal. Freedom is."' />
            </div>

            {/* Character */}
            <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '20px', marginBottom: '12px' }}>
              <span style={SECTION}>◈ Character</span>

              <span style={LABEL}>Bio</span>
              <textarea style={{ ...TEXTAREA }} rows={4} value={form.bio} onChange={(e) => set('bio', e.target.value)} placeholder="Who are they? Where do they come from? What shaped them?" />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={LABEL}>Vibe</span>
                  <input style={INPUT} value={form.vibe} onChange={(e) => set('vibe', e.target.value)} placeholder="Fierce, Principled, Tender in private" />
                </div>
                <div>
                  <span style={LABEL}>Energy</span>
                  <input style={INPUT} value={form.energy} onChange={(e) => set('energy', e.target.value)} placeholder="Fire / Unwavering" />
                </div>
                <div>
                  <span style={LABEL}>Style</span>
                  <input style={INPUT} value={form.style} onChange={(e) => set('style', e.target.value)} placeholder="Combat boots, natural everything" />
                </div>
                <div>
                  <span style={LABEL}>Background</span>
                  <input style={INPUT} value={form.background} onChange={(e) => set('background', e.target.value)} placeholder="Ferguson changed her. Everything since has been on purpose." />
                </div>
              </div>
            </div>

            {/* Personality vector */}
            <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '20px', marginBottom: '12px' }}>
              <span style={SECTION}>◈ Personality Vector</span>
              <div style={{ fontSize: '11px', color: 'var(--ivory-muted)', marginBottom: '14px' }}>
                Used by the Pulse Quiz matchmaking engine.
              </div>

              {DIMS.map((dim, i) => (
                <div key={dim} style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ ...LABEL, marginBottom: 0 }}>{dim}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--gold)' }}>
                      {Math.round(form.vector[i] * 100)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0" max="1" step="0.05"
                    value={form.vector[i]}
                    onChange={(e) => setVector(i, parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--gold)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '7px', color: 'var(--ivory-ghost)', marginTop: '2px' }}>
                    <span>{['Calm', 'Cool', 'Instinctive', 'Polished', 'Yielding'][i]}</span>
                    <span>{['Intense', 'Nurturing', 'Cerebral', 'Raw/Street', 'Dominant'][i]}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Visual */}
            <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '20px', marginBottom: '12px' }}>
              <span style={SECTION}>◈ Visual Style</span>

              <span style={LABEL}>Card Gradient (placeholder background)</span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                {GRADIENTS.map((g) => (
                  <button
                    key={g.val}
                    onClick={() => set('imageGradient', g.val)}
                    style={{
                      width: '40px', height: '40px', borderRadius: '3px',
                      background: g.val,
                      border: form.imageGradient === g.val ? '2px solid var(--gold)' : '1px solid var(--border-mid)',
                      cursor: 'pointer',
                    }}
                    title={g.label}
                  />
                ))}
              </div>

              <span style={LABEL}>Accent Color</span>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(e) => set('accentColor', e.target.value)}
                  style={{ width: '40px', height: '34px', border: '1px solid var(--border-mid)', borderRadius: '2px', background: 'transparent', cursor: 'pointer' }}
                />
                <input
                  style={{ ...INPUT, marginBottom: 0, flex: 1 }}
                  value={form.accentColor}
                  onChange={(e) => set('accentColor', e.target.value)}
                  placeholder="#3a3020"
                />
              </div>
            </div>

            {/* Prompt */}
            <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '20px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ ...SECTION, marginBottom: 0 }}>◈ Generation Prompt</span>
                <button
                  onClick={buildAutoPrompt}
                  style={{
                    padding: '4px 12px', background: 'none',
                    border: '1px solid var(--border-mid)', borderRadius: '2px',
                    cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    fontSize: '8.5px', letterSpacing: '0.14em', color: 'var(--ivory-muted)',
                  }}
                >
                  ↺ Auto-build from fields
                </button>
              </div>
              <textarea
                style={{ ...TEXTAREA, fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.02em' }}
                rows={5}
                value={form.prompt}
                onChange={(e) => set('prompt', e.target.value)}
                placeholder="RAW photo, analog film, real African American woman, natural skin texture..."
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#c0392b', marginBottom: '12px' }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={generatePreview}
                disabled={generating}
                style={{
                  flex: 1, padding: '12px',
                  background: 'transparent', border: `1px solid ${generating ? 'var(--border-dark)' : 'var(--gold-dim)'}`,
                  borderRadius: '2px', cursor: generating ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em',
                  textTransform: 'uppercase', color: generating ? 'var(--ivory-ghost)' : 'var(--gold)',
                }}
              >
                {generating ? '◈ Generating...' : '◆ Generate Preview'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 2, padding: '12px',
                  background: saving ? 'var(--border-mid)' : 'var(--gold)',
                  border: 'none', borderRadius: '2px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em',
                  textTransform: 'uppercase', color: saving ? 'var(--ivory-muted)' : 'var(--onyx)',
                  fontWeight: 500,
                }}
              >
                {saving ? 'Saving...' : '◈ Save Archetype'}
              </button>
            </div>
          </div>

          {/* Right — preview */}
          <div style={{ position: 'sticky', top: '32px' }}>
            <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', overflow: 'hidden' }}>

              {/* Portrait preview */}
              <div style={{ aspectRatio: '3/4', background: form.imageGradient, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {previewImage ? (
                  <img src={previewImage} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                ) : generating ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', color: 'var(--gold)', animation: 'spin 2s linear infinite', display: 'inline-block', marginBottom: '8px' }}>◈</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.14em', color: 'var(--gold)', textTransform: 'uppercase' }}>Generating...</div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', opacity: 0.3 }}>
                    <div style={{ fontSize: '28px', color: form.accentColor, marginBottom: '6px' }}>◈</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.14em', color: 'var(--ivory-ghost)', textTransform: 'uppercase' }}>Preview</div>
                  </div>
                )}

                {/* Dossier ID overlay */}
                <div style={{ position: 'absolute', top: '10px', left: '10px', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em', color: 'var(--gold)', background: 'rgba(0,0,0,0.7)', padding: '2px 7px', borderRadius: '2px', border: '1px solid var(--gold-dim)' }}>
                  {form.dossierId || '#???'}
                </div>
                <div style={{ position: 'absolute', top: '10px', right: '10px', fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--ivory-muted)', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '2px' }}>
                  {form.gender === 'M' ? '♂' : '♀'}
                </div>

                {/* Gradient overlay */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.85) 100%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--ivory)', fontWeight: 500 }}>{form.name || 'Name'}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ivory-muted)' }}>{form.archetype || 'Archetype'}</div>
                </div>
              </div>

              {/* Preview info */}
              <div style={{ padding: '14px' }}>
                {form.tagline && (
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontStyle: 'italic', color: 'var(--gold)', marginBottom: '8px', lineHeight: 1.4 }}>
                    "{form.tagline}"
                  </div>
                )}
                {form.vibe && (
                  <div style={{ fontSize: '11px', color: 'var(--ivory-ghost)', fontStyle: 'italic' }}>{form.vibe}</div>
                )}
                {previewSeed && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--ivory-ghost)', marginTop: '8px' }}>seed {previewSeed}</div>
                )}

                {/* Vector preview */}
                <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-dark)', paddingTop: '10px' }}>
                  {DIMS.map((dim, i) => (
                    <div key={dim} style={{ marginBottom: '5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.14em', color: 'var(--ivory-ghost)', textTransform: 'uppercase' }}>{dim}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', color: 'var(--ivory-ghost)' }}>{Math.round(form.vector[i] * 100)}</span>
                      </div>
                      <div style={{ height: '2px', background: 'var(--border-mid)', borderRadius: '1px' }}>
                        <div style={{ height: '2px', background: 'var(--gold)', width: `${form.vector[i] * 100}%`, borderRadius: '1px' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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