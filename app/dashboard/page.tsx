'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { vapi } from '@/lib/vapi';

const CallButton = dynamic(() => import('@/components/CallButton'), {
  ssr: false,
});

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
  const [status, setStatus] = useState('Idle');
  const [mode, setMode] = useState<'solo' | 'couples_spice' | 'couples_mediator'>('solo');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!vapi) return;
    vapi.on('call-start', () => setStatus('Connected'));
    vapi.on('call-end', () => { setStatus('Idle'); loadData(); });
    vapi.on('speech-start', () => setStatus('Speaking'));
    vapi.on('speech-end', () => setStatus('Listening'));
    vapi.on('error', () => setStatus('Error'));
    return () => { vapi?.removeAllListeners(); };
  }, []);

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
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

  const getStatusColor = () => {
    if (status === 'Connected' || status === 'Speaking') return 'text-red-400';
    if (status === 'Listening') return 'text-yellow-400';
    return 'text-gray-600';
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black">
        <p className="text-gray-700 animate-pulse text-xs tracking-widest uppercase">Loading...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-black text-white">

      {/* Hero Image — video call style */}
      <div className="relative w-full bg-black flex items-center justify-center" style={{ height: '70vh' }}>
        {companion?.image_url && (
          <img
            src={companion.image_url}
            alt={companion.name}
            className="h-full w-auto object-contain"
          />
        )}

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex justify-between items-start p-4"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' }}>
          <button
            onClick={() => router.push('/credits')}
            className="text-xs text-gray-400 hover:text-white transition"
          >
            {credits ? formatCredits(credits.balance_seconds) : '0s'} left
          </button>
          <button
            onClick={handleSignOut}
            className="text-xs text-gray-600 hover:text-gray-400 transition"
          >
            ✕
          </button>
        </div>

        {/* Name + tagline */}
        <div className="absolute bottom-0 left-0 right-0 p-6"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,1), transparent)' }}>
          <h1 className="text-3xl font-bold tracking-tight">{companion?.name}</h1>
          <p className="text-red-400 italic text-sm mt-0.5">{companion?.personas?.tagline}</p>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex flex-col items-center px-6 pt-6 pb-10 gap-6">

        {/* Mode selector */}
        <div className="flex gap-2 w-full max-w-sm">
          {[
            { key: 'solo', label: 'Solo' },
            { key: 'couples_spice', label: 'Spice 🔥' },
            { key: 'couples_mediator', label: 'Mediate 🕊️' },
          ].map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key as typeof mode)}
              className={`flex-1 py-2 rounded-full text-xs font-bold transition border ${
                mode === m.key
                  ? 'border-red-500 text-red-400 bg-red-950/20'
                  : 'border-gray-800 text-gray-600 hover:border-gray-600'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Call button */}
        <CallButton scenario={`Mode: ${getModeLabel()}`} />

        {/* Status */}
        <p className={`text-xs uppercase tracking-widest ${getStatusColor()}`}>
          {status}
        </p>

        {/* Discreet billing */}
        <p className="text-xs text-gray-800 uppercase tracking-widest mt-auto">
          Discreet Billing: AA Technical Services
        </p>
      </div>
    </main>
  );
}
