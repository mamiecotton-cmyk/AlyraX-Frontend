'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { vapi } from '@/lib/vapi';

const CallButton = dynamic(() => import('@/components/CallButton'), { ssr: false });

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
type PersonaOption = { name: string; tagline: string; };
type TranscriptMessage = {
  type?: string;
  role?: string;
  transcript?: string;
  transcriptType?: string;
};

type QueuedVideo = {
  url: string;
  onWait1: string;
  onWait2: string;
  onMid: string;
};

const MAX_QUEUE = 2;
const MID_POINT_MS = 15000;

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
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [selectedPersonaIndex, setSelectedPersonaIndex] = useState(0);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const conversationHistoryRef = useRef<{ role: string; content: string }[]>([]);
  const videoQueueRef = useRef<QueuedVideo[]>([]);
  const lastUserMessageRef = useRef<string>('');
  const isGeneratingRef = useRef(false);
  const currentVideoUrlRef = useRef<string | null>(null);
  const lastFrameUrlRef = useRef<string | null>(null);
  const clipNumberRef = useRef(0);
  const midPointTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentOnMidRef = useRef<string>('');
  const modeRef = useRef<Mode>('solo');
  const callingRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const companionRef = useRef<Companion | null>(null);
  const isLoopingRef = useRef(false);
  const wait2TimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { callingRef.current = calling; }, [calling]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { companionRef.current = companion; }, [companion]);
  useEffect(() => { currentVideoUrlRef.current = currentVideoUrl; }, [currentVideoUrl]);

  function buildSceneIntent(): string {
    const history = conversationHistoryRef.current.slice(-8);
    const metaPhrases = [
      'where is', "don't see", 'next video', 'are you there',
      'still there', 'hello', 'you there', "i can't see", 'not working',
      'i am', 'yes', 'yeah', 'ok', 'okay',
    ];
    const meaningful = history
      .filter(m => m.role === 'user')
      .map(m => m.content.trim())
      .filter(m => m.length > 5 && !metaPhrases.some(p => m.toLowerCase().includes(p)))
      .slice(-3)
      .join('. ');

    return meaningful || lastUserMessageRef.current || 'continue the scene';
  }

  async function pollVideoResult(predictionId: string): Promise<string> {
    const maxAttempts = 120;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const response = await fetch('/api/generate-video/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictionId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Video status failed');
      if (data.video_url) return data.video_url as string;
    }
    throw new Error('Video generation timed out');
  }

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUserId(user.id);
    userIdRef.current = user.id;

    const { data: companionData } = await supabase
      .from('companions')
      .select('*, personas(name, tagline, system_prompt, voice_id)')
      .eq('user_id', user.id);

    if (!companionData || companionData.length === 0) { router.push('/onboarding'); return; }

    const activeCompanionId = user.user_metadata?.active_companion_id;
    const activeCompanion = companionData.find(item => item.id === activeCompanionId) || companionData[0];

    setCompanions(companionData);
    setCompanion(activeCompanion);
    companionRef.current = activeCompanion;

    const { data: personasData } = await supabase
      .from('personas')
      .select('name, tagline')
      .order('sort_order');

    setPersonas(personasData || []);
    const currentPersonaIndex = personasData?.findIndex(p => p.name === activeCompanion.personas?.name) ?? -1;
    setSelectedPersonaIndex(currentPersonaIndex >= 0 ? currentPersonaIndex : 0);

    const { data: creditsData } = await supabase
      .from('credits')
      .select('balance_seconds')
      .eq('user_id', user.id)
      .single();

    setCredits(creditsData);
    setLoading(false);
  }

  async function extractLastFrame(): Promise<string | null> {
    if (!videoRef.current || !userIdRef.current) return null;
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 480;
      canvas.height = video.videoHeight || 854;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0);

      return new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
          if (!blob) { resolve(null); return; }
          const fileName = `${userIdRef.current}/frame-${Date.now()}.jpg`;
          const { data, error } = await supabase.storage
            .from('companions')
            .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

          if (error) { console.error('Frame upload error:', error); resolve(null); return; }

          const { data: urlData } = supabase.storage
            .from('companions')
            .getPublicUrl(data.path);

          console.log('Frame extracted:', urlData.publicUrl);
          resolve(urlData.publicUrl);
        }, 'image/jpeg', 0.92);
      });
    } catch (err) {
      console.error('Frame extraction error:', err);
      return null;
    }
  }


  function clearMidTimer() {
    if (midPointTimerRef.current) {
      clearTimeout(midPointTimerRef.current);
      midPointTimerRef.current = null;
    }
  }

  function clearWait2Timer() {
    if (wait2TimerRef.current) {
      clearTimeout(wait2TimerRef.current);
      wait2TimerRef.current = null;
    }
  }

  function startMidTimer() {
    clearMidTimer();
    if (!currentOnMidRef.current) return;
    midPointTimerRef.current = setTimeout(() => {
      if (vapi && currentOnMidRef.current) {
        vapi.say(currentOnMidRef.current, false, false, false);
      }
    }, MID_POINT_MS);
  }

  async function generateVideo(sceneIntent: string, frameUrl?: string | null) {
    const currentUserId = userIdRef.current;
    const currentCompanion = companionRef.current;

    // Block if already generating or queue is full
    if (!currentUserId || !currentCompanion || isGeneratingRef.current || videoQueueRef.current.length >= MAX_QUEUE) {
      console.log('Skipping generation:', {
        isGenerating: isGeneratingRef.current,
        queueLength: videoQueueRef.current.length,
      });
      return;
    }

    isGeneratingRef.current = true;
    setIsGenerating(true);

    const nextClipNumber = clipNumberRef.current + 1;

    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          companionId: currentCompanion.id,
          userMessage: sceneIntent,
          frameUrl: frameUrl ?? lastFrameUrlRef.current,
          clipNumber: nextClipNumber,
          conversationHistory: conversationHistoryRef.current.slice(-4),
        }),
      });

      const data = await response.json();
      if (!response.ok) { console.error('Video generation failed:', data); return; }

      if (data.prediction_id) {
        console.log('Clip number:', nextClipNumber);

        // Fire onWait1 immediately
        if (data.onWait1 && vapi) {
          vapi.say(data.onWait1, false, false, false);
        }

        // Fire onWait2 at 20 seconds
        clearWait2Timer();
        if (data.onWait2 && vapi) {
          wait2TimerRef.current = setTimeout(() => {
            if (vapi && !currentVideoUrlRef.current) {
              vapi.say(data.onWait2, false, false, false);
            }
          }, 20000);
        }

        const videoUrl = await pollVideoResult(data.prediction_id);
        clipNumberRef.current = nextClipNumber;

        const queued: QueuedVideo = {
          url: videoUrl,
          onWait1: data.onWait1 || '',
          onWait2: data.onWait2 || '',
          onMid: data.onMid || '',
        };

        if (!currentVideoUrlRef.current) {
          playVideo(queued);
        } else {
          videoQueueRef.current.push(queued);
          console.log('Video queued. Queue length:', videoQueueRef.current.length);
          if (isLoopingRef.current && videoRef.current) {
            isLoopingRef.current = false;
            playVideo(queued);
          }
        }
      }
    } catch (error) {
      console.error('Video generation error:', error);
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  }

  function playVideo(queued: QueuedVideo) {
    clearMidTimer();
    currentOnMidRef.current = queued.onMid;
    isLoopingRef.current = false;
    setCurrentVideoUrl(queued.url);
  }

  function resetVideoState() {
    setCurrentVideoUrl(null);
    videoQueueRef.current = [];
    lastFrameUrlRef.current = null;
    clipNumberRef.current = 0;
    isLoopingRef.current = false;
    clearMidTimer();
    clearWait2Timer();
    currentOnMidRef.current = '';
  }

  const handleVideoPlay = () => {
    // Stop onWait2 if video ready early
    clearWait2Timer();
    // Snap into sync with video starting
    if (vapi) {
      vapi.say('Watch me baby.', true, false, false);
    }
    startMidTimer();
    if (modeRef.current === 'solo_video' && callingRef.current && !isGeneratingRef.current && videoQueueRef.current.length < MAX_QUEUE) {
      generateVideo(buildSceneIntent());
    }
  };

  const handleVideoEnded = async () => {
    clearMidTimer();

    // Extract last frame for continuity
    const lastFrame = await extractLastFrame();
    if (lastFrame) lastFrameUrlRef.current = lastFrame;

    const next = videoQueueRef.current.shift();

    if (next) {
      // Next clip ready — play instantly
      isLoopingRef.current = false;
      playVideo(next);
    } else {
      // Nothing ready — loop from halfway
      if (videoRef.current && currentVideoUrlRef.current) {
        isLoopingRef.current = true;
        const video = videoRef.current;
        video.currentTime = video.duration * 0.5;
        video.play().catch(console.error);
        console.log('Looping from halfway while waiting for next clip');
      }
    }

    // Always try to generate more if queue has room
    if (modeRef.current === 'solo_video' && callingRef.current && !isGeneratingRef.current && videoQueueRef.current.length < MAX_QUEUE) {
      generateVideo(buildSceneIntent(), lastFrame);
    }
  };

  // When looping video ends, check queue again
  const handleLoopEnded = async () => {
    if (!isLoopingRef.current) return;
    const next = videoQueueRef.current.shift();
    if (next) {
      isLoopingRef.current = false;
      playVideo(next);
    } else {
      // Keep looping
      if (videoRef.current) {
        videoRef.current.currentTime = videoRef.current.duration * 0.5;
        videoRef.current.play().catch(console.error);
      }
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!vapi) return;

    vapi.on('call-start', () => {
      setStatus('connected');
      setCalling(true);
      callingRef.current = true;
    });

    vapi.on('call-end', () => {
      setStatus('idle');
      setCalling(false);
      callingRef.current = false;
      resetVideoState();
      loadData();
    });

    vapi.on('speech-start', () => setStatus('speaking'));
    vapi.on('speech-end', () => setStatus('listening'));
    vapi.on('error', () => { setStatus('idle'); setCalling(false); callingRef.current = false; });

    vapi.on('message', (message: TranscriptMessage) => {
      if (message.type === 'transcript' && message.role === 'user' && message.transcript) {
        if (message.transcriptType && message.transcriptType !== 'final') return;
        const userMessage = message.transcript.trim();
        if (!userMessage || userMessage.length < 3) return;

        lastUserMessageRef.current = userMessage;
        conversationHistoryRef.current.push({ role: 'user', content: userMessage });

        if (modeRef.current === 'solo_video' && callingRef.current && !isGeneratingRef.current && videoQueueRef.current.length < MAX_QUEUE) {
          generateVideo(buildSceneIntent());
        }
      }

      if (message.type === 'transcript' && message.role === 'assistant' && message.transcript) {
        conversationHistoryRef.current.push({ role: 'assistant', content: message.transcript });
      }
    });

    return () => { vapi?.removeAllListeners(); };
  }, []);

  useEffect(() => {
    if (showControls) {
      const timer = setTimeout(() => setShowControls(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showControls]);

  const formatCredits = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const getModeLabel = () => {
    if (mode === 'solo') return 'Solo';
    if (mode === 'solo_video') return 'Video';
    return 'Mediate';
  };

  const updatePersona = async (index: number) => {
    const previousIndex = selectedPersonaIndex;
    const selectedPersona = personas[index];
    if (!selectedPersona) return;

    setSelectedPersonaIndex(index);
    setCompanion(prev => prev ? {
      ...prev,
      personas: { ...prev.personas, name: selectedPersona.name, tagline: selectedPersona.tagline },
    } : prev);

    const response = await fetch('/api/companion/persona', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companionId: companion?.id, personaIndex: index }),
    });

    if (!response.ok) { setSelectedPersonaIndex(previousIndex); loadData(); }
  };

  const updateActiveCompanion = async (nextCompanion: Companion) => {
    setCompanion(nextCompanion);
    companionRef.current = nextCompanion;
    resetVideoState();
    const currentPersonaIndex = personas.findIndex(p => p.name === nextCompanion.personas?.name);
    setSelectedPersonaIndex(currentPersonaIndex >= 0 ? currentPersonaIndex : 0);

    const response = await fetch('/api/companion/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companionId: nextCompanion.id }),
    });

    if (!response.ok) loadData();
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
      {/* Still image base layer */}
      {companion?.image_url && (
        <img
          src={companion.image_url}
          alt={companion.name}
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}

      {/* Video layer */}
      {mode === 'solo_video' && currentVideoUrl && (
        <video
          ref={videoRef}
          src={currentVideoUrl}
          className="absolute inset-0 w-full h-full object-contain"
          autoPlay
          playsInline
          onPlay={handleVideoPlay}
          onEnded={isLoopingRef.current ? handleLoopEnded : handleVideoEnded}
        />
      )}

      {/* Generating indicator — only when no video playing */}
      {mode === 'solo_video' && isGenerating && !currentVideoUrl && (
        <div className="absolute bottom-32 left-0 right-0 flex justify-center">
          <p className="text-xs text-red-400 italic animate-pulse">
            give me a second baby...
          </p>
        </div>
      )}

      {/* Red pulse */}
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

        <div className="flex flex-col items-center gap-4 p-6">
          <div className="text-center">
            <p className="text-white font-semibold tracking-wide">{companion?.name}</p>
            <p className="text-red-400 text-xs italic">{companion?.personas?.tagline}</p>
          </div>

          {companions.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2 max-w-sm">
              {companions.map(item => (
                <button
                  key={item.id}
                  onClick={(e) => { e.stopPropagation(); updateActiveCompanion(item); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition border ${
                    companion?.id === item.id
                      ? 'border-red-500 text-red-400 bg-red-950/30'
                      : 'border-gray-700 text-gray-500'
                  }`}
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); router.push('/onboarding'); }}
            className="text-xs text-yellow-500 hover:text-yellow-400 transition"
          >
            Add Persona
          </button>

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

          {personas.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 max-w-sm">
              {personas.map((persona, index) => (
                <button
                  key={persona.name}
                  onClick={(e) => { e.stopPropagation(); updatePersona(index); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition border ${
                    selectedPersonaIndex === index
                      ? 'border-yellow-500 text-yellow-400 bg-yellow-950/20'
                      : 'border-gray-700 text-gray-500'
                  }`}
                >
                  {persona.name.replace('AlyraX ', '')}
                </button>
              ))}
            </div>
          )}

          <div onClick={(e) => e.stopPropagation()}>
            <CallButton scenario={`Mode: ${getModeLabel()}`} companionId={companion?.id} />
          </div>

          <p className="text-xs text-gray-700 uppercase tracking-widest pb-2">
            Discreet Billing: AA Technical Services
          </p>
        </div>
      </div>
    </main>
  );
}