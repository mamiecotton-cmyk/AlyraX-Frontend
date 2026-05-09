'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { vapi } from '@/lib/vapi';

const CallButton = dynamic(() => import('@/components/CallButton'), {
  ssr: false,
});
import LivePortraitVideo from '@/components/LivePortraitVideo';

type Companion = {
  id: string;
  name: string;
  image_url: string;
  persona_id: string;
  personas: {
    name: string;
    tagline: string;
    system_prompt: string;
    voice_id: string | null;
  };
};

type Credits = {
  balance_seconds: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [companion, setCompanion] = useState<Companion | null>(null);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [status, setStatus] = useState('idle');
  const [mode, setMode] = useState<'solo' | 'solo_video' | 'couples_spice' | 'couples_mediator'>('solo');
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [calling, setCalling] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!vapi) return;
    vapi.on('call-start', () => { setStatus('connected'); setCalling(true); });
    vapi.on('call-end', () => { setStatus('idle'); setCalling(false); loadData(); });
    vapi.on('speech-start', () => setStatus('speaking'));
    vapi.on('speech-end', () => setStatus('listening'));
    vapi.on('error', () => { setStatus('idle'); setCalling(false); });
    return () => { vapi?.removeAllListeners(); };
  }, []);

  // Auto-hide controls after 3 seconds
  useEffect(() => {
    if (showControls) {
      const timer = setTimeout(() => setShowControls(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showControls]);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: companionData } = await supabase
      .from('companions')
      .select('*, personas(name, tagline, system_prompt, voice_id)')
      .eq('user_id', user.id)
      .single();

    if (!companionData) { router.push('/onboarding'); return; }
    setCompanion(companionData);

    const { data: creditsData } = await supabase
      .from('credits')
      .select('balance_seconds')
      .eq('user_id', user.id)
      .single();

    setCredits(creditsData);
    setLoading(false);
  };

  const formatCredits = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const getModeLabel = () => {
    if (mode === 'solo') return 'Solo';
    if (mode === 'couples_spice') return 'Spice';
    return 'Mediate';
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black">
        <p className="text-gray-700 animate-pulse text-xs tracking-widest uppercase">...</p>
      </main>
    );
  }

  return (
    <main
      className="relative w-full bg-black overflow-hidden cursor-pointer"
      style={{ height: '100dvh' }}
      onClick={() => setShowControls(prev => !prev)}
    >
      {/* Full screen companion image */}
      {companion?.image_url && (
        mode === 'solo_video' && calling ? (
          <LivePortraitVideo
            companionImageUrl={companion.image_url || ''}
            isCallActive={calling}
            vapiInstance={vapi}
          />
        ) : (
          <img
            src={companion.image_url}
            alt={companion.name}
            className="absolute inset-0 w-full h-full object-contain"
          />
        )
      )}

      {/* Subtle status pulse when on call */}
      {calling && (
        <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      )}

      {/* Controls overlay — appears on tap/click, auto-hides */}
      <div
        className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-500 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 40%, rgba(0,0,0,0.4) 100%)' }}
      >
        {/* Top bar */}
        <div className="flex justify-between items-center p-5">
          <button
            onClick={(e) => { e.stopPropagation(); router.push('/credits'); }}
            className="text-xs text-gray-400 hover:text-white transition"
          >
            {credits ? formatCredits(credits.balance_seconds) : '0s'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); supabase.auth.signOut().then(() => router.push('/login')); }}
            className="text-xs text-gray-500 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Bottom controls */}
        <div className="flex flex-col items-center gap-4 p-6">

          {/* Name + tagline */}
          <div className="text-center">
            <p className="text-white font-semibold tracking-wide">{companion?.name}</p>
            <p className="text-red-400 text-xs italic">{companion?.personas?.tagline}</p>
          </div>

          {/* Mode selector */}
          <div className="flex gap-2">
            {[
              { key: 'solo', label: 'Solo' },
              { key: 'solo_video', label: '📹 Video' },
              { key: 'couples_spice', label: 'Spice 🔥' },
              { key: 'couples_mediator', label: 'Mediate 🕊️' },
            ].map(m => (
              <button
                key={m.key}
                onClick={(e) => { e.stopPropagation(); setMode(m.key as typeof mode); }}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition border ${
                  mode === m.key
                    ? 'border-red-500 text-red-400 bg-red-950/30'
                    : 'border-gray-700 text-gray-500'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Call button */}
          <div onClick={(e) => e.stopPropagation()}>
            <CallButton scenario={`Mode: ${getModeLabel()}`} />
          </div>

          <p className="text-xs text-gray-700 uppercase tracking-widest pb-2">
            Discreet Billing: AA Technical Services
          </p>
        </div>
      </div>
    </main>
  );
}