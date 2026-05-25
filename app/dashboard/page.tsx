'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Sidebar from '@/components/Sidebar';
import ArchetypeCard from '@/components/ArchetypeCard';
import { archetypes } from '@/lib/archetypes';
import dynamic from 'next/dynamic';
import { vapi } from '@/lib/vapi';
import { getCompanionMemory, getUserDisplayName, type CompanionMemory } from '@/lib/companion-memory';

const CallButton = dynamic(() => import('@/components/CallButton'), { ssr: false });
const TalkingPortrait = dynamic(() => import('@/components/TalkingPortrait'), { ssr: false });

type Companion = {
  id: string;
  name: string;
  image_url: string;
  archetype_id?: string | null;
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
  const router  = useRouter();
  const supabase = createClient();

  const [companion, setCompanion]   = useState<Companion | null>(null);
  const [loading, setLoading]       = useState(true);
  const [userName, setUserName]     = useState('');
  const [lastMemory, setLastMemory] = useState<CompanionMemory | null>(null);
  const [status, setStatus]         = useState('idle');
  const [calling, setCalling]       = useState(false);
  const [filter, setFilter]         = useState<Filter>('all');
  const [showCallPanel, setShowCallPanel] = useState(false);
  const [mode, setMode]             = useState<'solo' | 'solo_video'>('solo');
  const [archetypeImages, setArchetypeImages] = useState<Record<string, string>>({});
  const [archetypeVideos, setArchetypeVideos] = useState<Record<string, string>>({});

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

  useEffect(() => {
    fetch('/api/archetypes/images', { cache: 'no-store' })
      .then((r) => r.json())
      .then(({ images }) => setArchetypeImages(images || {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/archetypes/featured-videos', { cache: 'no-store' })
      .then((r) => r.json())
      .then(({ videos }) => setArchetypeVideos(videos || {}))
      .catch(() => {});
  }, []);

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
      <div style={{ display: 'flex', width: '100%', height: '100dvh', background: '#f5f5f0', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.3em', color: '#0a0a0a', textTransform: 'uppercase' }}>
          Accessing Archive...
        </div>
      </div>
    );
  }

  const featuredId = 'jaxon';

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
          background: '#f5f5f0',
        }}
      >
        {/* Top bar */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 28px',
            borderBottom: '1px solid #e0e0d8',
            background: '#ffffff',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 400, color: '#0a0a0a', letterSpacing: '0.02em' }}>
              The Archive
            </div>
            <span style={{ color: '#ccc' }}>—</span>
            <div style={{ fontSize: '14px', color: '#0a0a0a' }}>
              {archetypes.length} Archetypes
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {userName && (
              <div style={{ fontSize: '14px', color: '#0a0a0a', fontWeight: 500 }}>
                {userName}
              </div>
            )}
            {companion && (
              <>
                <button
                  onClick={() => router.push(`/chat/${companion.id}`)}
                  style={{
                    padding: '8px 18px',
                    background: 'transparent',
                    border: '1px solid #0a0a0a',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#0a0a0a',
                  }}
                >
                  💬 Chat
                </button>
                <button
                  onClick={() => setShowCallPanel((p) => !p)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 18px',
                    background: showCallPanel ? '#0a0a0a' : 'transparent',
                    border: '1px solid #0a0a0a',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: showCallPanel ? '#ffffff' : '#0a0a0a',
                    transition: 'all 0.15s',
                  }}
                >
                  ◉ {calling ? 'On Call' : 'Call ' + companion.name}
                </button>
              </>
            )}
            <button
              onClick={() => router.push('/onboarding')}
              style={{
                padding: '8px 20px',
                background: '#e63946',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                color: '#ffffff',
              }}
            >
              + New Companion
            </button>
          </div>
        </header>

        {/* Call panel */}
        {showCallPanel && companion && (
          <div
            className="fade-in"
            style={{
              display: 'flex',
              alignItems: 'stretch',
              borderBottom: '1px solid #e0e0d8',
              background: '#ffffff',
              flexShrink: 0,
            }}
          >
            <div style={{ width: '100px', minWidth: '100px', position: 'relative', overflow: 'hidden', background: '#1a1a1a' }}>
              {companion.image_url && mode === 'solo' && (
                <TalkingPortrait
                  imageUrl={companion.image_url}
                  name={companion.name}
                  state={calling ? (status === 'speaking' ? 'speaking' : 'listening') : 'idle'}
                />
              )}
              {companion.image_url && mode !== 'solo' && (
                <img src={companion.image_url} alt={companion.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
            <div style={{ flex: 1, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: '#0a0a0a', marginBottom: '2px' }}>
                  {companion.name}
                </div>
                <div style={{ fontSize: '13px', color: '#0a0a0a' }}>
                  {companion.personas?.tagline || 'Your AI Companion'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['solo', 'solo_video'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      style={{
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: mode === m ? '#ffffff' : '#0a0a0a',
                        background: mode === m ? '#0a0a0a' : 'transparent',
                        border: '1px solid #0a0a0a',
                        borderRadius: '3px',
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
                  archetypeId={companion.archetype_id}
                  promptUsed={companion.prompt_used}
                  userName={userName}
                  lastMemory={lastMemory}
                />
              </div>
            </div>
          </div>
        )}

        {/* No companion banner */}
        {!companion && (
          <div
            className="fade-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 28px',
              borderBottom: '1px solid #e0e0d8',
              background: '#ffffff',
              flexShrink: 0,
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: '#0a0a0a', marginBottom: '2px' }}>
                Find your match
              </div>
              <div style={{ fontSize: '13px', color: '#0a0a0a' }}>
                Complete the Pulse Quiz — 5 questions — to find your archetype match.
              </div>
            </div>
            <button
              onClick={() => router.push('/pulse-quiz')}
              style={{ padding: '9px 20px', background: '#e63946', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: '#ffffff' }}
            >
              Take the Pulse Quiz
            </button>
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

          {/* Filter + header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 400, color: '#0a0a0a' }}>
              The Archetypes
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['all', 'M', 'F'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '7px 18px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: filter === f ? '#ffffff' : '#0a0a0a',
                    background: filter === f ? '#0a0a0a' : 'transparent',
                    border: '1px solid #0a0a0a',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {f === 'all' ? 'All' : f === 'M' ? 'Men' : 'Women'}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: '#e0e0d8', marginBottom: '20px' }} />

          {/* Card grid — Secrets.ai style */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))',
              gap: '14px',
            }}
          >
            {displayArchetypes.map((archetype, i) => (
              <ArchetypeCard
                key={archetype.id}
                archetype={archetype}
                featured={archetype.id === featuredId}
                delay={i * 0.03}
                imageUrl={archetypeImages[archetype.id] || null}
                videoUrl={archetypeVideos[archetype.id] || null}
              />
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}
