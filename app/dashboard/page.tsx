'use client';
import { useEffect, useRef, useState } from 'react';
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

type Credits = { balance_seconds: number };
type Mode = 'solo' | 'solo_video' | 'couples_spice' | 'couples_mediator';

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [companion, setCompanion] = useState<Companion | null>(null);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [status, setStatus] = useState('idle');
  const [mode, setMode] = useState<Mode>('solo');
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [calling, setCalling] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Video state
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const conversationHistoryRef = useRef<{ role: string; content: string }[]>([]);
  const nextVideoUrlRef = useRef<string | null>(null);
  const lastUserMessageRef = useRef<string>('');

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!vapi) return;

    vapi.on('call-start', () => {
      setStatus('connected');
      setCalling(true);
    });

    vapi.on('call-end', () => {
      setStatus('idle');
      setCalling(false);
      setCurrentVideoUrl(null);
      nextVideoUrlRef.current = null;
      conversationHistoryRef.current = [];
      loadData();
    });

    vapi.on('speech-start', () => setStatus('speaking'));
    vapi.on('speech-end', () => setStatus('listening'));
    vapi.on('error', () => { setStatus('idle'); setCalling(false); });

    // Listen for transcripts to capture conversation
    vapi.on('message', (message: any) => {
      if (message.type === 'transcript' && message.role === 'user' && message.transcript) {
        const userMessage = message.transcript;
        lastUserMessageRef.current = userMessage;

        conversationHistoryRef.current.push({
          role: 'user',
          content: userMessage,
        });

        // Trigger video generation if in video mode
        if (mode === 'solo_video' && calling && !isGenerating) {
          generateVideo(userMessage);
        }
      }

      if (message.type === 'transcript' && message.role === 'assistant' && message.transcript) {
        conversationHistoryRef.current.push({
          role: 'assistant',
          content: message.transcript,
        });
      }
    });

    return () => { vapi?.removeAllListeners(); };
  }, [mode, calling, isGenerating]);

  // Auto-hide controls
  useEffect(() => {
    if (showControls) {
      const timer = setTimeout(() => setShowControls(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showControls]);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUserId(user.id);

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

  const generateVideo = async (userMessage: string) => {
    if (!userId || !companion || isGenerating) return;
    setIsGenerating(true);

    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          userMessage,
          conversationHistory: conversationHistoryRef.current.slice(-4),
        }),
      });

      const data = await response.json();

      if (data.video_url) {
        // If nothing playing, play now
        if (!currentVideoUrl) {
          setCurrentVideoUrl(data.video_url);
        } else {
          // Buffer as next video
          nextVideoUrlRef.current = data.video_url;
        }
      }
    } catch (error) {
      console.error('Video generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVideoEnd = () => {
    if (nextVideoUrlRef.current) {
      setCurrentVideoUrl(nextVideoUrlRef.current);
      nextVideoUrlRef.current = null;
      // Pre-generate next if we have a recent message
      if (lastUserMessageRef.current && mode === 'solo_video' && calling) {
        generateVideo(lastUserMessageRef.current);
      }
    } else {
      setCurrentVideoUrl(null);
    }
  };

  const formatCredits = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const getModeLabel = () => {
    if (mode === 'solo') return 'Solo';
    if (mode === 'solo_video') return 'Video';
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
      {/* Still image — base layer always visible */}
      {companion?.image_url && (
        <img
          src={companion.image_url}
          alt={companion.name}
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}

      {/* Video layer — plays over still image when active */}
      {mode === 'solo_video' && currentVideoUrl && (
        <video
          ref={videoRef}
          src={currentVideoUrl}
          className="absolute inset-0 w-full h-full object-contain"
          autoPlay
          playsInline
          onEnded={handleVideoEnd}
        />
      )}

      {/* Generating indicator */}
      {mode === 'solo_video' && isGenerating && !currentVideoUrl && (
        <div className="absolute bottom-32 left-0 right-0 flex justify-center">
          <p className="text-xs text-red-400 italic animate-pulse">
            give me a second baby...
          </p>
        </div>
      )}

      {/* Red pulse when on call */}
      {calling && (
        <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      )}

      {/* Controls overlay */}
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
          <div className="text-center">
            <p className="text-white font-semibold tracking-wide">{companion?.name}</p>
            <p className="text-red-400 text-xs italic">{companion?.personas?.tagline}</p>
          </div>

          {/* Mode selector */}
          <div className="flex gap-2">
            {[
              { key: 'solo', label: 'Voice $1.99' },
              { key: 'solo_video', label: '📹 Video $3.99' },
            ].map(m => (
              <button
                key={m.key}
                onClick={(e) => { e.stopPropagation(); setMode(m.key as Mode); }}
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