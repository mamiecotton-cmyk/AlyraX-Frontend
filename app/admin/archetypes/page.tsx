'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { archetypes, type Archetype, type CustomArchetypeRow, customRowToArchetype } from '@/lib/archetypes';

// ─── Types ─────────────────────────────────────────────────────────────────
type ImageMap   = Record<string, string>;
type PromptMap  = Record<string, string>;

type CardState = {
  archetype: Archetype;
  isCustom: boolean;
  customId?: string;
  imageUrl: string | null;
  savedPrompt: string;
  editedPrompt: string;
  promptOpen: boolean;
  saving: boolean;
  generating: boolean;
  deleting: boolean;
  status: 'has-image' | 'no-image' | 'generating' | 'error';
  error: string | null;
};

type GenderFilter  = 'all' | 'M' | 'F';
type StatusFilter  = 'all' | 'has-image' | 'no-image' | 'custom';

// ─── Helpers ───────────────────────────────────────────────────────────────
const CHIP = (active: boolean): React.CSSProperties => ({
  padding: '5px 14px',
  fontFamily: 'var(--font-mono)',
  fontSize: '9px',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: active ? 'var(--onyx)' : 'var(--ivory-muted)',
  background: active ? 'var(--gold)' : 'transparent',
  border: `1px solid ${active ? 'var(--gold)' : 'var(--border-mid)'}`,
  borderRadius: '2px',
  cursor: 'pointer',
  transition: 'all 0.15s',
});

// ─── Component ─────────────────────────────────────────────────────────────
export default function AdminArchetypesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [checking, setChecking]   = useState(true);
  const [cards, setCards]         = useState<CardState[]>([]);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch]       = useState('');
  const [expandAll, setExpandAll] = useState(false);

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return; }
      setChecking(false);
    });
  }, [router, supabase]);

  // Load images + custom archetypes
  useEffect(() => {
    if (checking) return;

    async function load() {
      const [imagesRes, customRes] = await Promise.all([
        fetch('/api/archetypes/images').then((r) => r.json()).catch(() => ({ images: {} })),
        fetch('/api/archetypes/custom').then((r) => r.json()).catch(() => ({ archetypes: [] })),
      ]);

      const imageMap: ImageMap   = imagesRes.images  ?? {};
      const promptMap: PromptMap = {};
      const customRows: CustomArchetypeRow[] = customRes.archetypes ?? [];

      // Build cards for the 20 hardcoded archetypes
      const hardcodedCards: CardState[] = archetypes.map((a) => ({
        archetype: a,
        isCustom: false,
        imageUrl: imageMap[a.id] || null,
        savedPrompt: promptMap[a.id] || '',
        editedPrompt: promptMap[a.id] || '',
        promptOpen: false,
        saving: false,
        generating: false,
        deleting: false,
        status: imageMap[a.id] ? 'has-image' : 'no-image',
        error: null,
      }));

      // Build cards for custom archetypes
      const customCards: CardState[] = customRows.map((row) => ({
        archetype: customRowToArchetype(row),
        isCustom: true,
        customId: row.id,
        imageUrl: row.image_url || null,
        savedPrompt: row.prompt_used || '',
        editedPrompt: row.prompt_used || '',
        promptOpen: false,
        saving: false,
        generating: false,
        deleting: false,
        status: row.image_url ? 'has-image' : 'no-image',
        error: null,
      }));

      setCards([...hardcodedCards, ...customCards]);
    }

    load();
  }, [checking]);

  // Fetch prompt_used for hardcoded archetypes from archetype_images table
  useEffect(() => {
    if (checking) return;
    // Load prompt_used from archetype_images for hardcoded archetypes
    fetch('/api/archetypes/prompts')
      .then((r) => r.json())
      .then(({ prompts }: { prompts: Record<string, string> }) => {
        if (!prompts) return;
        // Update saved/edited prompts and ensure all cards are collapsed by default
        setCards((prev) => prev.map((c) =>
          !c.isCustom && prompts[c.archetype.id]
            ? { ...c, savedPrompt: prompts[c.archetype.id], editedPrompt: prompts[c.archetype.id], promptOpen: false }
            : { ...c, promptOpen: false }
        ));
        setExpandAll(false);
      })
      .catch(() => {});
  }, [checking]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (genderFilter !== 'all' && c.archetype.gender !== genderFilter) return false;
      if (statusFilter === 'has-image' && !c.imageUrl) return false;
      if (statusFilter === 'no-image' && c.imageUrl) return false;
      if (statusFilter === 'custom' && !c.isCustom) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !c.archetype.name.toLowerCase().includes(q) &&
          !c.archetype.archetype.toLowerCase().includes(q) &&
          !c.archetype.vibe.toLowerCase().includes(q) &&
          !c.archetype.dossierId.includes(q)
        ) return false;
      }
      return true;
    });
  }, [cards, genderFilter, statusFilter, search]);

  // ── Card updater ──────────────────────────────────────────────────────────
  function updateCard(id: string, patch: Partial<CardState>) {
    setCards((prev) => prev.map((c) => c.archetype.id === id ? { ...c, ...patch } : c));
  }

  // ── Save prompt ───────────────────────────────────────────────────────────
  async function savePrompt(card: CardState) {
    updateCard(card.archetype.id, { saving: true });

    try {
      if (card.isCustom && card.customId) {
        // Update custom archetype
        await fetch(`/api/archetypes/custom/${card.customId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt_used: card.editedPrompt }),
        });
      } else {
        // Update archetype_images table
        await fetch('/api/archetypes/images/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            archetype_id: card.archetype.id,
            image_url: card.imageUrl || '',
            prompt_used: card.editedPrompt,
          }),
        });
      }
      updateCard(card.archetype.id, { saving: false, savedPrompt: card.editedPrompt });
    } catch {
      updateCard(card.archetype.id, { saving: false });
    }
  }

  // ── Regenerate image ──────────────────────────────────────────────────────
  async function regenerate(card: CardState) {
    updateCard(card.archetype.id, { generating: true, status: 'generating', error: null });

    const prompt = card.editedPrompt || card.savedPrompt;
    if (!prompt.trim()) {
      updateCard(card.archetype.id, { generating: false, status: card.imageUrl ? 'has-image' : 'no-image', error: 'Add a prompt first' });
      return;
    }

    try {
      const genRes = await fetch('/api/generate-companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: prompt,
          style: 'portrait',
          num_inference_steps: 35,
          guidance_scale: 7.5,
          seed: -1,
        }),
      });

      const genData = await genRes.json();
      if (!genRes.ok || !genData.image_url) throw new Error(genData.error || 'Generation failed');

      const imageUrl: string = genData.image_url;

      // Save image URL
      if (card.isCustom && card.customId) {
        await fetch(`/api/archetypes/custom/${card.customId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: imageUrl, seed: genData.seed }),
        });
      } else {
        await fetch('/api/archetypes/images/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            archetype_id: card.archetype.id,
            image_url: imageUrl,
            seed: genData.seed,
            prompt_used: prompt,
          }),
        });
      }

      updateCard(card.archetype.id, { generating: false, imageUrl, status: 'has-image' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      updateCard(card.archetype.id, { generating: false, status: 'error', error: msg });
    }
  }

  // ── Delete custom archetype ───────────────────────────────────────────────
  async function deleteCustom(card: CardState) {
    if (!card.customId || !confirm(`Delete ${card.archetype.name}? This cannot be undone.`)) return;
    updateCard(card.archetype.id, { deleting: true });

    await fetch(`/api/archetypes/custom/${card.customId}`, { method: 'DELETE' });
    setCards((prev) => prev.filter((c) => c.archetype.id !== card.archetype.id));
  }

  // ── Toggle all prompts ────────────────────────────────────────────────────
  function toggleAllPrompts() {
    const next = !expandAll;
    setExpandAll(next);
    setCards((prev) => prev.map((c) => ({ ...c, promptOpen: next })));
  }

  const stats = {
    total:    cards.length,
    hasImage: cards.filter((c) => c.imageUrl).length,
    custom:   cards.filter((c) => c.isCustom).length,
    pending:  cards.filter((c) => !c.imageUrl).length,
  };

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
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '6px' }}>
              ◈ Admin — Archetypes
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--ivory)', marginBottom: '4px' }}>
              Archetype Manager
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ivory-muted)' }}>
              Edit prompts, regenerate images, and add new archetypes.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => router.push('/admin/generate')}
              style={CHIP(false)}
            >
              ◈ Generate All
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              style={CHIP(false)}
            >
              ◁ Dashboard
            </button>
            <button
              onClick={() => router.push('/admin/archetypes/new')}
              style={{
                padding: '7px 18px',
                background: 'var(--gold)',
                border: 'none',
                borderRadius: '2px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--onyx)',
                fontWeight: 500,
              }}
            >
              + Add Archetype
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '20px' }}>
          {[
            { label: 'Total', val: stats.total, color: 'var(--ivory-dim)' },
            { label: 'Has Image', val: stats.hasImage, color: '#27ae60' },
            { label: 'Pending', val: stats.pending, color: 'var(--gold)' },
            { label: 'Custom', val: stats.custom, color: '#9b59b6' },
          ].map((s) => (
            <div key={s.label} style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '12px 16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '4px' }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '24px', color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>

          {/* Gender filters */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['all', 'M', 'F'] as GenderFilter[]).map((g) => (
              <button key={g} onClick={() => setGenderFilter(g)} style={CHIP(genderFilter === g)}>
                {g === 'all' ? '◉ All' : g === 'M' ? '△ Men' : '▽ Women'}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div style={{ width: '1px', height: '20px', background: 'var(--border-mid)' }} />

          {/* Status filters */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {([
              { val: 'all', label: '◉ All' },
              { val: 'has-image', label: '✓ Has Image' },
              { val: 'no-image', label: '◌ No Image' },
              { val: 'custom', label: '✦ Custom' },
            ] as { val: StatusFilter; label: string }[]).map((s) => (
              <button key={s.val} onClick={() => setStatusFilter(s.val)} style={CHIP(statusFilter === s.val)}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div style={{ width: '1px', height: '20px', background: 'var(--border-mid)' }} />

          {/* Search */}
          <input
            type="text"
            placeholder="Search name, archetype, vibe..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: '160px',
              padding: '6px 12px',
              background: 'var(--charcoal-mid)',
              border: '1px solid var(--border-mid)',
              borderRadius: '2px',
              color: 'var(--ivory)',
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              outline: 'none',
            }}
            onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--gold-dim)')}
            onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--border-mid)')}
          />

          {/* Divider */}
          <div style={{ width: '1px', height: '20px', background: 'var(--border-mid)' }} />

          {/* Expand/collapse all */}
          <button onClick={toggleAllPrompts} style={CHIP(false)}>
            {expandAll ? '▲ Collapse All' : '▼ Expand All'}
          </button>

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ivory-ghost)', letterSpacing: '0.1em' }}>
            {filtered.length} shown
          </div>
        </div>

        {/* Gold rule */}
        <div style={{ height: '1px', background: 'linear-gradient(90deg, var(--gold) 0%, transparent 100%)', marginBottom: '20px' }} />

        {/* Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', fontFamily: 'var(--font-display)', fontSize: '16px', fontStyle: 'italic', color: 'var(--ivory-ghost)' }}>
              No archetypes match that filter.
            </div>
          )}

          {filtered.map((card) => {
            const statusColor = {
              'has-image': '#27ae60',
              'no-image': 'var(--ivory-ghost)',
              generating: 'var(--gold)',
              error: '#c0392b',
            }[card.status];

            const promptDirty = card.editedPrompt !== card.savedPrompt;

            return (
              <div
                key={card.archetype.id}
                style={{
                  background: 'var(--charcoal)',
                  border: `1px solid ${card.isCustom ? 'rgba(155,89,182,0.3)' : 'var(--border-dark)'}`,
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                {/* Card header — always visible */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px' }}>

                  {/* Thumbnail */}
                  <div
                    style={{
                      width: '52px',
                      height: '70px',
                      flexShrink: 0,
                      borderRadius: '2px',
                      overflow: 'hidden',
                      background: card.archetype.imageGradient,
                      border: '1px solid var(--border-mid)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}
                  >
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={card.archetype.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                    ) : card.status === 'generating' ? (
                      <span style={{ fontSize: '16px', color: 'var(--gold)', animation: 'spin 2s linear infinite', display: 'inline-block' }}>◈</span>
                    ) : (
                      <span style={{ fontSize: '14px', color: 'var(--ivory-ghost)', opacity: 0.3 }}>◈</span>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--ivory)' }}>{card.archetype.name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.14em', color: 'var(--gold)', background: 'rgba(212,175,55,0.08)', padding: '1px 6px', borderRadius: '2px', border: '1px solid var(--gold-dim)' }}>{card.archetype.dossierId}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--ivory-ghost)' }}>{card.archetype.gender === 'M' ? '♂' : '♀'}</span>
                      {card.isCustom && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.14em', color: '#9b59b6', border: '1px solid rgba(155,89,182,0.4)', padding: '1px 6px', borderRadius: '2px' }}>CUSTOM</span>}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ivory-muted)', marginBottom: '3px' }}>{card.archetype.archetype}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ivory-ghost)', fontStyle: 'italic' }}>{card.archetype.vibe}</div>
                    {card.error && <div style={{ fontSize: '10px', color: '#c0392b', marginTop: '3px' }}>{card.error}</div>}
                  </div>

                  {/* Status + Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {/* Status dot */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.12em', textTransform: 'uppercase', color: statusColor }}>
                        {card.status === 'has-image' ? 'Ready' : card.status === 'no-image' ? 'No image' : card.status === 'generating' ? 'Working...' : 'Error'}
                      </span>
                    </div>

                    {/* Regenerate */}
                    <button
                      onClick={() => regenerate(card)}
                      disabled={card.generating}
                      style={{
                        padding: '5px 12px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '8.5px',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: card.generating ? 'var(--ivory-ghost)' : 'var(--gold)',
                        background: 'transparent',
                        border: `1px solid ${card.generating ? 'var(--border-dark)' : 'var(--gold-dim)'}`,
                        borderRadius: '2px',
                        cursor: card.generating ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {card.generating ? '◈ Working...' : card.imageUrl ? '↺ Regen' : '◆ Generate'}
                    </button>

                    {/* Delete (custom only) */}
                    {card.isCustom && (
                      <button
                        onClick={() => deleteCustom(card)}
                        disabled={card.deleting}
                        style={{
                          padding: '5px 10px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '8.5px',
                          letterSpacing: '0.14em',
                          color: '#c0392b',
                          background: 'transparent',
                          border: '1px solid rgba(192,57,43,0.3)',
                          borderRadius: '2px',
                          cursor: 'pointer',
                        }}
                      >
                        ✕ Delete
                      </button>
                    )}

                    {/* Collapse toggle */}
                    <button
                      onClick={() => updateCard(card.archetype.id, { promptOpen: !card.promptOpen })}
                      style={{
                        padding: '5px 10px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '9px',
                        color: card.promptOpen ? 'var(--gold)' : 'var(--ivory-muted)',
                        background: card.promptOpen ? 'var(--gold-glow)' : 'transparent',
                        border: `1px solid ${card.promptOpen ? 'var(--gold-dim)' : 'var(--border-mid)'}`,
                        borderRadius: '2px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {card.promptOpen ? '▲ Prompt' : '▼ Prompt'}
                      {promptDirty && !card.promptOpen && (
                        <span style={{ marginLeft: '4px', color: 'var(--gold)', fontSize: '7px' }}>●</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Collapsible prompt editor */}
                {card.promptOpen && (
                  <div style={{ borderTop: '1px solid var(--border-dark)', padding: '14px 16px', background: 'var(--charcoal-mid)' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '8px' }}>
                      ◈ Generation Prompt {promptDirty && <span style={{ color: 'var(--ivory-muted)', marginLeft: '8px' }}>● Unsaved changes</span>}
                    </div>
                    <textarea
                      value={card.editedPrompt}
                      onChange={(e) => updateCard(card.archetype.id, { editedPrompt: e.target.value })}
                      placeholder="Describe this archetype for image generation — appearance, setting, mood, clothing, lighting..."
                      rows={5}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'var(--onyx)',
                        border: `1px solid ${promptDirty ? 'var(--gold-dim)' : 'var(--border-mid)'}`,
                        borderRadius: '2px',
                        color: 'var(--ivory)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        lineHeight: 1.6,
                        resize: 'vertical',
                        outline: 'none',
                        marginBottom: '10px',
                        letterSpacing: '0.02em',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      {promptDirty && (
                        <button
                          onClick={() => updateCard(card.archetype.id, { editedPrompt: card.savedPrompt })}
                          style={{
                            padding: '6px 14px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '8.5px',
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            color: 'var(--ivory-muted)',
                            background: 'transparent',
                            border: '1px solid var(--border-mid)',
                            borderRadius: '2px',
                            cursor: 'pointer',
                          }}
                        >
                          ✕ Discard
                        </button>
                      )}
                      <button
                        onClick={() => savePrompt(card)}
                        disabled={card.saving || !promptDirty}
                        style={{
                          padding: '6px 16px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '8.5px',
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                          color: (!promptDirty || card.saving) ? 'var(--ivory-ghost)' : 'var(--onyx)',
                          background: (!promptDirty || card.saving) ? 'var(--border-mid)' : 'var(--gold)',
                          border: 'none',
                          borderRadius: '2px',
                          cursor: (!promptDirty || card.saving) ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {card.saving ? 'Saving...' : '◈ Save Prompt'}
                      </button>
                      <button
                        onClick={() => { savePrompt(card).then(() => regenerate(card)); }}
                        disabled={card.generating || card.saving}
                        style={{
                          padding: '6px 16px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '8.5px',
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                          color: card.generating ? 'var(--ivory-ghost)' : 'var(--gold)',
                          background: 'transparent',
                          border: `1px solid ${card.generating ? 'var(--border-dark)' : 'var(--gold-dim)'}`,
                          borderRadius: '2px',
                          cursor: card.generating ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {card.generating ? '◈ Working...' : '◆ Save & Regenerate'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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