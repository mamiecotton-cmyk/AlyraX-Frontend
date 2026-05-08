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
    vapi.on('call-end', () => {
      setStatus('Ended');
      loadData(); // refresh credits after call
    });
    vapi.on('speech-start', () => setStatus('Speaking'));
    vapi.on('speech-end', () => setStatus('Listening'));
    vapi.on('error', () => setStatus('Error'));

    return () => { vapi?.removeAllListeners(); };
  }, []);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    // Load companion with persona
    const { data: companionData } = await supabase
      .from('companions')
      .select('*, personas(name, tagline, system_prompt, voice_id)')
      .eq('user_id', user.id)
      .single();

    if (!companionData) {
      router.push('/onboarding');
      return;
    }

    setCompanion(companionData);

    // Load credits
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

  const getRateLabel = () => {
    if (mode === 'solo') return '$1.99/min';
    return '$2.99/min';
  };

  const getModeLabel = () => {
    if (mode === 'solo') return 'Solo';
    if (mode === 'couples_spice') return 'Couples — Spice';
    return 'Couples — Mediator';
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-gray-500 animate-pulse">Loading...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-md border border-gray-800 rounded-2xl bg-zinc-900/50 p-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-red-600 tracking-tighter">AlyraX</h1>
          <button
            onClick={handleSignOut}
            className="text-xs text-gray-600 hover:text-gray-400 transition"
          >
            Sign out
          </button>
        </div>

        {/* Companion */}
        {companion && (
          <div className="flex items-center gap-4 mb-6">
            {companion.image_url && (
              <img
                src={companion.image_url}
                alt={companion.name}
                className="w-16 h-20 object-cover rounded-xl border border-gray-700"
              />
            )}
            <div>
              <h2 className="text-xl font-bold">{companion.name}</h2>
              <p className="text-red-400 text-sm italic">
                {companion.personas?.tagline}
              </p>
              <p className="text-gray-500 text-xs mt-0.5">
                {companion.personas?.name}
              </p>
            </div>
          </div>
        )}

        {/* Credits */}
        <div className="bg-black border border-gray-800 rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs uppercase text-gray-500 tracking-widest">Credits</p>
              <p className="text-2xl font-bold text-white">
                {credits ? formatCredits(credits.balance_seconds) : '0s'}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">{getRateLabel()}</p>
            </div>
            <button
              onClick={() => router.push('/credits')}
              className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-700 transition"
            >
              Add Credits
            </button>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="mb-6">
          <p className="text-xs uppercase text-gray-500 tracking-widest mb-3">Mode</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'solo', label: 'Solo', rate: '$1.99' },
              { key: 'couples_spice', label: 'Spice 🔥', rate: '$2.99' },
              { key: 'couples_mediator', label: 'Mediate 🕊️', rate: '$2.99' },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => setMode(m.key as typeof mode)}
                className={`p-2 rounded-xl border text-center transition ${
                  mode === m.key
                    ? 'border-red-500 bg-red-950/20'
                    : 'border-gray-700 hover:border-gray-500'
                }`}
              >
                <p className="text-xs font-bold">{m.label}</p>
                <p className="text-xs text-gray-500">{m.rate}/min</p>
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div className="flex justify-between items-center mb-4">
          <span className="text-xs uppercase text-gray-500 tracking-widest">Status</span>
          <span className="text-xs uppercase text-yellow-500 tracking-widest font-bold">
            {status}
          </span>
        </div>

        {/* Call Button */}
        <CallButton scenario={`Mode: ${getModeLabel()}`} />

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-800 text-center">
          <p className="text-xs text-gray-600 uppercase tracking-widest">
            Discreet Billing: AA Technical Services
          </p>
        </div>
      </div>
    </main>
  );
}