'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Sidebar from '@/components/Sidebar';
import ArchetypeCard from '@/components/ArchetypeCard';
import { archetypes } from '@/lib/archetypes';

import dynamic from 'next/dynamic';
import { vapi } from '@/lib/vapi';
import {
  getCompanionMemory,
  getUserDisplayName,
  type CompanionMemory,
} from '@/lib/companion-memory';

const CallButton = dynamic(() => import('@/components/CallButton'), { ssr: false });
const TalkingPortrait = dynamic(() => import('@/components/TalkingPortrait'), { ssr: false });

type Companion = {
  id: string;
  name: string;
  image_url: string;
  prompt_used?: string | null;
  persona_id: string;
  personas: {
    name: string;
    tagline: string;
    system_prompt: string;
    voice_id: string | null;
  };
};

type Filter = 'all' | 'M' | 'F';

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [companion, setCompanion] = useState<Companion | null>(null);
  const [loading, setLoading]     = useState(true);
  const [userName, setUserName]   = useState('');
  const [lastMemory, setLastMemory] = useState<CompanionMemory | null>(null);
  const [status, setStatus]       = useState('idle');
  const [calling, setCalling]     = useState(false);
  const [filter, setFilter]       = useState<Filter>('all');
  const [showCallPanel, setShowCallPanel] = useState(false);
  const [mode, setMode]           = useState<'solo' | 'solo_video'>('solo');
  const [archetypeImages, setArchetypeImages] = useState<Record<string, string>>({});

  // Filtered archetype grid
  const displayArchetypes = useMemo(() => {
    if (filter === 'all') return archetypes;
    return archetypes.filter((a) => a.gender === filter);
  }, [filter]);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const displayName = getUserDisplayName(user.user_metadata, user.email);
      setUserName(displayName);

      const { data: companionData } = await supabase
        .from('companions')
        .select('*, personas(name, tagline, system_prompt, voice_id)')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (companionData) {
        setCompanion(companionData);
        setLastMemory(getCompanionMemory(user.user_metadata, companionData.id));
      }

      setLoading(false);
    }
    loadData();
  }, [router, supabase]);

  // Fetch archetype portrait images
  useEffect(() => {
    fetch('/api/archetypes/images')
      .then((r) => r.json())
      .then(({ images }) => setArchetypeImages(images || {}))
      .catch(() => {});
  }, []);

  // Vapi listeners
  useEffect(() => {
    if (!vapi) return;
    vapi.on('call-start', () => { setStatus('connected'); setCalling(true); });
    vapi.on('call-end',   () => { setStatus('idle');      setCalling(false); });
    vapi.on('speech-start', () => setStatus('speaking'));
    vapi.on('speech-end',   () => setStatus('listening'));
    vapi.on('error',        () => { setStatus('idle'); setCalling(false); });
    return () => { vapi?.removeAllListeners(); };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', width: '100%', height: '100dvh', background: 'var(--onyx)', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.3em', color: 'var(--ivory-ghost)', textTransform: 'uppercase', animation: 'fadeSlideUp 0.4s ease' }}>
          Accessing Archive...
        </div>
      </div>
    );
  }

  const featuredId = companion ? null : 'jaxon'; // show jaxon as featured if no companion yet

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '14px',
                fontWeight: 400,
                color: 'var(--ivory)',
                letterSpacing: '0.04em',
              }}
            >
              The Archive
            </div>
            <span style={{ color: 'var(--ivory-ghost)', fontSize: '10px' }}>—</span>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--ivory-muted)',
              }}
            >
              20 Archetypes · All Clearances
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {userName && (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.14em',
                  color: 'var(--ivory-ghost)',
                  textTransform: 'uppercase',
                }}
              >
                {userName}
              </div>
            )}
            {companion && (
              <button
                onClick={() => setShowCallPanel((p) => !p)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  background: showCallPanel ? 'var(--gold-hover)' : 'transparent',
                  border: '1px solid var(--gold-dim)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--gold)',
                  transition: 'background 0.15s',
                }}
              >
                ◉ {calling ? 'On Call' : 'Call ' + companion.name}
              </button>
            )}
            <button
              onClick={() => router.push('/onboarding')}
              style={{
                padding: '6px 14px',
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
              + New Companion
            </button>
          </div>
        </header>

        {/* Call slide-down panel */}
        {showCallPanel && companion && (
          <div
            className="fade-in"
            style={{
              display: 'flex',
              alignItems: 'stretch',
              borderBottom: '1px solid var(--border-dark)',
              background: 'var(--charcoal)',
              flexShrink: 0,
            }}
          >
            {/* Portrait */}
            <div
              style={{
                width: '120px',
                minWidth: '120px',
                position: 'relative',
                overflow: 'hidden',
                background: 'var(--charcoal-mid)',
              }}
            >
              {companion.image_url && mode === 'solo' && (
                <TalkingPortrait
                  imageUrl={companion.image_url}
                  name={companion.name}
                  state={calling ? (status === 'speaking' ? 'speaking' : 'listening') : 'idle'}
                />
              )}
              {companion.image_url && mode !== 'solo' && (
                <img
                  src={companion.image_url}
                  alt={companion.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
            </div>

            {/* Call controls */}
            <div
              style={{
                flex: 1,
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '18px',
                    fontWeight: 500,
                    color: 'var(--ivory)',
                    marginBottom: '4px',
                  }}
                >
                  {companion.name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: 'var(--ivory-muted)',
                  }}
                >
                  {companion.personas?.tagline || 'Your AI Companion'}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Mode toggle */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['solo', 'solo_video'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      style={{
                        padding: '5px 12px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '8.5px',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: mode === m ? 'var(--onyx)' : 'var(--ivory-muted)',
                        background: mode === m ? 'var(--gold)' : 'transparent',
                        border: '1px solid ' + (mode === m ? 'var(--gold)' : 'var(--border-mid)'),
                        borderRadius: '2px',
                        cursor: 'pointer',
                      }}
                    >
                      {m === 'solo' ? '◎ Voice' : '▷ Video'}
                    </button>
                  ))}
                </div>

                <CallButton
                  scenario={`Mode: ${mode === 'solo_video' ? 'Video' : 'Solo'}`}
                  companionId={companion.id}
                  voiceId={companion.personas?.voice_id}
                  companionName={companion.name}
                  personaName={companion.personas?.name}
                  personaTagline={companion.personas?.tagline}
                  promptUsed={companion.prompt_used}
                  userName={userName}
                  lastMemory={lastMemory}
                />
              </div>
            </div>
          </div>
        )}

        {/* Pulse quiz banner - shown when no companion exists */}
        {!companion && (
          <div
            className="fade-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 28px',
              borderBottom: '1px solid rgba(212,175,55,0.15)',
              background: 'rgba(212,175,55,0.04)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  border: '1px solid var(--gold-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--gold)',
                  fontSize: '14px',
                  flexShrink: 0,
                }}
              >
                ◆
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '14px',
                    color: 'var(--ivory)',
                    marginBottom: '2px',
                  }}
                >
                  Identity not yet synchronized
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--ivory-muted)',
                  }}
                >
                  Complete the Pulse Quiz — 5 questions, 90 seconds — to find your archetype match.
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push('/pulse-quiz')}
              className="btn-gold"
            >
              ◈ Take the Pulse Quiz
            </button>
          </div>
        )}

        {/* Main scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

          {/* Section header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.24em',
                  textTransform: 'uppercase',
                  color: 'var(--gold)',
                  marginBottom: '4px',
                }}
              >
                ◈ Active Dossiers
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '24px',
                  fontWeight: 400,
                  color: 'var(--ivory)',
                  letterSpacing: '0.02em',
                }}
              >
                The Archetypes
              </div>
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['all', 'M', 'F'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '6px 14px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: filter === f ? 'var(--onyx)' : 'var(--ivory-muted)',
                    background: filter === f ? 'var(--gold)' : 'transparent',
                    border: '1px solid ' + (filter === f ? 'var(--gold)' : 'var(--border-mid)'),
                    borderRadius: '2px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {f === 'all' ? '◉ All' : f === 'M' ? '△ Men' : '▽ Women'}
                </button>
              ))}
            </div>
          </div>

          {/* Gold rule */}
          <div className="gold-rule" style={{ marginBottom: '22px' }} />

          {/* Card grid */}
          <div className="archetype-grid" style={{ display: 'grid', gap: '12px' }}>
            {displayArchetypes.map((archetype, i) => (
              <ArchetypeCard
                key={archetype.id}
                archetype={archetype}
                featured={archetype.id === featuredId}
                delay={i * 0.035}
                imageUrl={archetypeImages[archetype.id] || null}
              />
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}