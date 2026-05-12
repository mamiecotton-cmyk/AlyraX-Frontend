'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { vapi } from '@/lib/vapi';
import { type SessionDirectives, updateSessionDirectives } from '@/lib/session-directives';
import {
  getCompanionMemory,
  getUserDisplayName,
  type CompanionMemory,
  type CompanionMemoryMap,
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

type Credits = { balance_seconds: number };
type Mode = 'solo' | 'solo_video' | 'couples_spice' | 'couples_mediator';
type WardrobeState = 'clothed' | 'partial' | 'nude';
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
  readyLine: string;
};

const MAX_QUEUE = 2;
const MID_POINT_MS = 15000;
const LOOP_TAIL_SECONDS = 3;
const READY_LINE_DELAY_MS = 2400;

// Map session directives to runtime instruction text we append via UpdatePrompt
function buildRuntimeInstruction(
  previous: SessionDirectives,
  next: SessionDirectives,
): string | null {
  const changes: string[] = [];
  if (next.pace && next.pace !== previous.pace) {
    if (next.pace === 'slow') changes.push('User wants SLOWER pace. Shorter sentences. Longer pauses. Draw it out.');
    if (next.pace === 'fast') changes.push('User wants FASTER pace. More urgent, quicker beats.');
  }
  if (next.intensity && next.intensity !== previous.intensity) {
    if (next.intensity === 'soft') changes.push('User wants SOFTER intensity now. Gentler language. Less aggressive.');
    if (next.intensity === 'teasing') changes.push('User wants more TEASING now. Build suspense, draw it out.');
    if (next.intensity === 'intense') changes.push('User wants MORE INTENSE now. Escalate explicitness.');
  }
  if (next.tone && next.tone !== previous.tone) {
    changes.push(`User wants tone shift to: ${next.tone}. Adopt that energy immediately.`);
  }
  if (next.talkativeness && next.talkativeness !== previous.talkativeness) {
    if (next.talkativeness === 'minimal') changes.push('User wants LESS TALKING. Respond in 1 short sentence max until they say otherwise.');
    if (next.talkativeness === 'chatty') changes.push('User wants MORE TALKING. Be vocal, narrate more.');
  }
  if (next.feedback === 'negative' && previous.feedback !== 'negative') {
    changes.push('User said "not like that." Drop the current direction. Try something different.');
  }
  if (next.boundaries && next.boundaries.length > (previous.boundaries?.length || 0)) {
    const newOnes = next.boundaries.filter(b => !(previous.boundaries || []).includes(b));
    if (newOnes.length) changes.push(`User set new boundaries: ${newOnes.join(', ')}. Respect immediately.`);
  }
  return changes.length ? changes.join(' ') : null;
}

function mapPaceToSpeed(pace?: string): 'slowest' | 'slow' | 'normal' | 'fast' | 'fastest' {
  if (pace === 'slow') return 'slow';
  if (pace === 'fast') return 'fast';
  return 'normal';
}

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
  const [videoPlaybackKey, setVideoPlaybackKey] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [userName, setUserName] = useState('');
  const [lastMemory, setLastMemory] = useState<CompanionMemory | null>(null);
  const [memoryMap, setMemoryMap] = useState<CompanionMemoryMap>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const conversationHistoryRef = useRef<{ role: string; content: string }[]>([]);
  const videoQueueRef = useRef<QueuedVideo[]>([]);
  const lastUserMessageRef = useRef<string>('');
  const isGeneratingRef = useRef(false);
  const currentVideoUrlRef = useRef<string | null>(null);
  const lastFrameUrlRef = useRef<string | null>(null);
  const clipNumberRef = useRef(0);
  const submittedClipNumberRef = useRef(0);
  const wardrobeStateRef = useRef<WardrobeState>('clothed');
  const midPointTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentOnMidRef = useRef<string>('');
  const modeRef = useRef<Mode>('solo');
  const callingRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const companionRef = useRef<Companion | null>(null);
  const isLoopingRef = useRef(false);
  const wait2TimerRef = useRef<NodeJS.Timeout | null>(null);
  const readyLineTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callGenerationRef = useRef(0);
  const waitNarrationClipRef = useRef<number | null>(null);
  const pendingPlaybackRef = useRef(false);
  const sessionDirectivesRef = useRef<SessionDirectives>({});

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { callingRef.current = calling; }, [calling]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { companionRef.current = companion; }, [companion]);
  useEffect(() => { currentVideoUrlRef.current = currentVideoUrl; }, [currentVideoUrl]);

  function buildSceneIntent(): string {
    const history = conversationHistoryRef.current.slice(-12);
    const metaPhrases = [
      'where is', "don't see", 'next video', 'are you there',
      'still there', 'hello', 'you there', "i can't see", 'not working',
      'i am', 'yes', 'yeah', 'ok', 'okay',
    ];
    const meaningfulUser = history
      .filter(m => m.role === 'user')
      .map(m => m.content.trim())
      .filter(m => m.length > 5 && !metaPhrases.some(p => m.toLowerCase().includes(p)))
      .slice(-3)
      .join('. ');
    const latestCompanionNarration = [...history]
      .reverse()
      .find(m => m.role === 'assistant' && m.content.trim().length > 5)
      ?.content.trim();

    if (meaningfulUser && latestCompanionNarration) {
      return `User wants: ${meaningfulUser}. Companion just narrated: ${latestCompanionNarration}`;
    }

    return meaningfulUser || latestCompanionNarration || lastUserMessageRef.current || 'continue the scene';
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
      if (data.video_url) {
        return `/api/video-proxy?url=${encodeURIComponent(data.video_url as string)}`;
      }
    }
    throw new Error('Video generation timed out');
  }

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUserId(user.id);
    userIdRef.current = user.id;
    const displayName = getUserDisplayName(user.user_metadata, user.email);
    setUserName(displayName);
    const savedMemories = (user.user_metadata?.alyrax_memories || {}) as CompanionMemoryMap;
    setMemoryMap(savedMemories);

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
    setLastMemory(getCompanionMemory({ alyrax_memories: savedMemories }, activeCompanion.id));

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

  async function extractLastFrame(clipNumberForLogging?: number): Promise<string | null> {
    const tag = `[frame-capture clip=${clipNumberForLogging ?? '?'}]`;

    if (!videoRef.current) {
      console.warn(`${tag} skipped: no video element`);
      return null;
    }
    if (!userIdRef.current) {
      console.warn(`${tag} skipped: no userId`);
      return null;
    }

    const video = videoRef.current;
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // If the video element has been torn down or hasn't loaded metadata,
    // videoWidth will be 0. Bail out rather than silently writing a blank frame.
    if (!videoWidth || !videoHeight) {
      console.warn(`${tag} skipped: video has no dimensions (w=${videoWidth} h=${videoHeight}) — likely torn down or unloaded`);
      return null;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error(`${tag} failed: could not get 2d context`);
        return null;
      }

      try {
        ctx.drawImage(video, 0, 0);
      } catch (drawErr) {
        // drawImage throws SecurityError if the video is tainted (cross-origin without CORS)
        console.error(`${tag} failed: drawImage threw`, drawErr);
        return null;
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
      });

      if (!blob) {
        console.error(`${tag} failed: canvas.toBlob returned null`);
        return null;
      }

      const fileName = `${userIdRef.current}/frame-${Date.now()}.jpg`;
      const { data, error } = await supabase.storage
        .from('companions')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

      if (error) {
        console.error(`${tag} failed: supabase upload error`, error);
        return null;
      }

      const { data: urlData } = supabase.storage.from('companions').getPublicUrl(data.path);
      console.log(`${tag} captured: ${urlData.publicUrl}`);
      return urlData.publicUrl;
    } catch (err) {
      console.error(`${tag} failed: unexpected error`, err);
      return null;
    }
  }

  function clearMidTimer() {
    if (midPointTimerRef.current) { clearTimeout(midPointTimerRef.current); midPointTimerRef.current = null; }
  }
  function clearWait2Timer() {
    if (wait2TimerRef.current) { clearTimeout(wait2TimerRef.current); wait2TimerRef.current = null; }
  }
  function clearReadyLineTimer() {
    if (readyLineTimerRef.current) { clearTimeout(readyLineTimerRef.current); readyLineTimerRef.current = null; }
  }

  function startMidTimer() {
    clearMidTimer();
    if (!currentOnMidRef.current) return;
    midPointTimerRef.current = setTimeout(() => {
      if (vapi && currentOnMidRef.current) vapi.say(currentOnMidRef.current);
    }, MID_POINT_MS);
  }

  async function generateVideo(sceneIntent: string, frameUrl?: string | null) {
    const currentUserId = userIdRef.current;
    const currentCompanion = companionRef.current;
    const generationCallId = callGenerationRef.current;

    if (
      !currentUserId || !currentCompanion || !callingRef.current
      || modeRef.current !== 'solo_video' || isGeneratingRef.current
      || pendingPlaybackRef.current || videoQueueRef.current.length >= MAX_QUEUE
    ) return;

    isGeneratingRef.current = true;
    setIsGenerating(true);
    const nextClipNumber = submittedClipNumberRef.current + 1;
    submittedClipNumberRef.current = nextClipNumber;

    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          companionId: currentCompanion.id,
          userMessage: sceneIntent,
          directives: sessionDirectivesRef.current,
          frameUrl: frameUrl ?? lastFrameUrlRef.current,
          wardrobeState: wardrobeStateRef.current,
          conversationHistory: conversationHistoryRef.current.slice(-12),
        }),
      });

      const data = await response.json();
      if (!response.ok) { console.error('Video generation failed:', data); return; }
      if (generationCallId !== callGenerationRef.current || !callingRef.current || modeRef.current !== 'solo_video') return;
      if (data.endWardrobeState === 'clothed' || data.endWardrobeState === 'partial' || data.endWardrobeState === 'nude') {
        wardrobeStateRef.current = data.endWardrobeState;
      }

      if (data.prediction_id) {
        const shouldNarrateWait = waitNarrationClipRef.current !== nextClipNumber;
        waitNarrationClipRef.current = nextClipNumber;
        clearWait2Timer();
        if (shouldNarrateWait && data.onWait1 && vapi) vapi.say(data.onWait1);

        const videoUrl = await pollVideoResult(data.prediction_id);
        clearWait2Timer();
        clipNumberRef.current = nextClipNumber;
        if (generationCallId !== callGenerationRef.current || !callingRef.current || modeRef.current !== 'solo_video') return;

        const queued: QueuedVideo = {
          url: videoUrl,
          onWait1: data.onWait1 || '',
          onWait2: data.onWait2 || '',
          onMid: data.onMid || '',
          readyLine: data.readyLine || '',
        };

        if (!currentVideoUrlRef.current) {
          playVideo(queued);
        } else if (isLoopingRef.current && videoRef.current) {
          playVideo(queued);
        } else {
          videoQueueRef.current.push(queued);
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
    if (!callingRef.current || modeRef.current !== 'solo_video') return;
    clearMidTimer();
    clearReadyLineTimer();
    currentOnMidRef.current = queued.onMid;

    if (queued.readyLine && vapi) {
      pendingPlaybackRef.current = true;
      vapi.say(queued.readyLine);
      if (currentVideoUrlRef.current && videoRef.current) {
        isLoopingRef.current = true;
        loopVideoTail();
      }
      readyLineTimerRef.current = setTimeout(() => {
        if (!callingRef.current || modeRef.current !== 'solo_video') {
          pendingPlaybackRef.current = false; readyLineTimerRef.current = null; return;
        }
        pendingPlaybackRef.current = false;
        readyLineTimerRef.current = null;
        isLoopingRef.current = false;
        currentVideoUrlRef.current = queued.url;
        setVideoPlaybackKey((key) => key + 1);
        setCurrentVideoUrl(queued.url);
      }, READY_LINE_DELAY_MS);
      return;
    }

    pendingPlaybackRef.current = false;
    isLoopingRef.current = false;
    currentVideoUrlRef.current = queued.url;
    setVideoPlaybackKey((key) => key + 1);
    setCurrentVideoUrl(queued.url);
  }

  function resetVideoState() {
    setCurrentVideoUrl(null);
    videoQueueRef.current = [];
    lastFrameUrlRef.current = null;
    clipNumberRef.current = 0;
    submittedClipNumberRef.current = 0;
    wardrobeStateRef.current = 'clothed';
    isLoopingRef.current = false;
    sessionDirectivesRef.current = {};
    pendingPlaybackRef.current = false;
    waitNarrationClipRef.current = null;
    clearMidTimer();
    clearWait2Timer();
    clearReadyLineTimer();
    currentOnMidRef.current = '';
  }

  async function saveCallMemory() {
    const currentCompanion = companionRef.current;
    const messages = conversationHistoryRef.current.slice(-12);
    if (!currentCompanion?.id || messages.length < 2) return;
    try {
      const response = await fetch('/api/companion/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: currentCompanion.id, messages, mode: modeRef.current }),
      });
      const data = await response.json();
      if (response.ok && data.memory) {
        setLastMemory(data.memory);
        setMemoryMap(prev => ({ ...prev, [currentCompanion.id]: data.memory }));
      }
    } catch (error) {
      console.error('Memory save failed:', error);
    }
  }

  function prefetchNextClip(frameUrl?: string | null) {
    if (
      modeRef.current !== 'solo_video' || !callingRef.current || isGeneratingRef.current
      || pendingPlaybackRef.current || videoQueueRef.current.length >= MAX_QUEUE
    ) return;
    const continuityFrame = frameUrl ?? lastFrameUrlRef.current;
    if ((currentVideoUrlRef.current || pendingPlaybackRef.current) && !continuityFrame) return;
    generateVideo(buildSceneIntent(), continuityFrame);
  }

  function loopVideoTail() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    video.currentTime = Math.max(duration - LOOP_TAIL_SECONDS, 0);
    video.play().catch(console.error);
  }

  const handleVideoPlay = () => {
    if (isLoopingRef.current) return;
    clearWait2Timer();
    startMidTimer();
  };

  const handleVideoEnded = async () => {
    clearMidTimer();

    // Capture the actual last frame of THIS clip before anything else runs.
    // Pass the clip number for debug logging so you can match frame captures to clips.
    const endingClipNumber = clipNumberRef.current;
    const lastFrame = await extractLastFrame(endingClipNumber);

    if (lastFrame) {
      lastFrameUrlRef.current = lastFrame;
    } else {
      // CRITICAL: do NOT silently fall through with the previous clip's frame.
      // The previous behavior reused stale frames, which is the root cause of
      // the "same frame across multiple clips" bug in Atlas request logs.
      console.warn(
        `[frame-capture clip=${endingClipNumber}] no fresh frame captured — keeping previous: ${lastFrameUrlRef.current}`
      );
    }

    if (readyLineTimerRef.current && isLoopingRef.current) { loopVideoTail(); return; }
    const next = videoQueueRef.current.shift();
    if (next) {
      isLoopingRef.current = false;
      playVideo(next);
      prefetchNextClip(lastFrame);
      return;
    }
    prefetchNextClip(lastFrame);
    if (videoRef.current && currentVideoUrlRef.current) {
      isLoopingRef.current = true;
      loopVideoTail();
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!vapi) return;

    vapi.on('call-start', () => {
      setStatus('connected');
      setCalling(true);
      callingRef.current = true;
      callGenerationRef.current += 1;
    });

    vapi.on('call-end', () => {
      void saveCallMemory();
      setStatus('idle');
      setCalling(false);
      callingRef.current = false;
      callGenerationRef.current += 1;
      resetVideoState();
      loadData();
    });

    vapi.on('speech-start', () => setStatus('speaking'));
    vapi.on('speech-end', () => setStatus('listening'));
    vapi.on('error', () => {
      setStatus('idle');
      setCalling(false);
      callingRef.current = false;
      callGenerationRef.current += 1;
      resetVideoState();
    });

    vapi.on('message', (message: TranscriptMessage) => {
      if (message.type === 'transcript' && message.role === 'user' && message.transcript) {
        if (message.transcriptType && message.transcriptType !== 'final') return;
        const userMessage = message.transcript.trim();
        if (!userMessage || userMessage.length < 3) return;

        lastUserMessageRef.current = userMessage;

        // Detect directive changes and push them to Deepgram in real time
        const previousDirectives = sessionDirectivesRef.current;
        const nextDirectives = updateSessionDirectives(previousDirectives, userMessage);
        sessionDirectivesRef.current = nextDirectives;

        const runtimeInstruction = buildRuntimeInstruction(previousDirectives, nextDirectives);
        if (runtimeInstruction && vapi) {
          console.log('Pushing runtime instruction to agent:', runtimeInstruction);
          vapi.updatePrompt(runtimeInstruction);
        }

        const nextSpeed = mapPaceToSpeed(nextDirectives.pace);
        const prevSpeed = mapPaceToSpeed(previousDirectives.pace);
        if (nextSpeed !== prevSpeed && vapi) {
          console.log('Pushing speed change to Cartesia:', nextSpeed);
          vapi.updateSpeed(nextSpeed);
        }

        conversationHistoryRef.current.push({ role: 'user', content: userMessage });
        prefetchNextClip();
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
    setLastMemory(memoryMap[nextCompanion.id] || null);
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
      {companion?.image_url && mode === 'solo' && (
        <TalkingPortrait
          imageUrl={companion.image_url}
          name={companion.name}
          state={calling ? (status === 'speaking' ? 'speaking' : 'listening') : 'idle'}
        />
      )}

      {companion?.image_url && mode !== 'solo' && (
        <img src={companion.image_url} alt={companion.name} className="absolute inset-0 w-full h-full object-contain" />
      )}

      {mode === 'solo_video' && currentVideoUrl && (
        <video
          ref={videoRef}
          key={videoPlaybackKey}
          src={currentVideoUrl}
          className="absolute inset-0 w-full h-full object-contain"
          autoPlay
          crossOrigin="anonymous"
          playsInline
          onPlay={handleVideoPlay}
          onEnded={handleVideoEnded}
        />
      )}

      {mode === 'solo_video' && isGenerating && !currentVideoUrl && (
        <div className="absolute bottom-32 left-0 right-0 flex justify-center">
          <p className="text-xs text-red-400 italic animate-pulse">give me a second baby...</p>
        </div>
      )}

      {calling && (<div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-red-500 animate-pulse" />)}

      <div
        className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-500 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 40%, rgba(0,0,0,0.4) 100%)' }}
      >
        <div className="flex justify-between items-center p-5">
          <button onClick={(e) => { e.stopPropagation(); router.push('/credits'); }} className="text-xs text-gray-400 hover:text-white transition">
            {credits ? formatCredits(credits.balance_seconds) : '0s'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); supabase.auth.signOut().then(() => router.push('/login')); }} className="text-xs text-gray-500 hover:text-white transition">✕</button>
        </div>

        <div className="flex flex-col items-center gap-4 p-6">
          <div className="text-center">
            <p className="text-white font-semibold tracking-wide">{companion?.name}</p>
            <p className="text-red-400 text-xs italic">{companion?.personas?.tagline}</p>
          </div>

          {companions.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2 max-w-sm">
              {companions.map(item => (
                <button key={item.id} onClick={(e) => { e.stopPropagation(); updateActiveCompanion(item); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition border ${
                    companion?.id === item.id ? 'border-red-500 text-red-400 bg-red-950/30' : 'border-gray-700 text-gray-500'
                  }`}>
                  {item.name}
                </button>
              ))}
            </div>
          )}

          <button onClick={(e) => { e.stopPropagation(); router.push('/onboarding'); }} className="text-xs text-yellow-500 hover:text-yellow-400 transition">Add Persona</button>

          <div className="flex gap-2">
            {[
              { key: 'solo', label: 'Voice $1.99' },
              { key: 'solo_video', label: '📹 Video $3.99' },
            ].map(m => (
              <button key={m.key} onClick={(e) => { e.stopPropagation(); setMode(m.key as Mode); }}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition border ${
                  mode === m.key ? 'border-red-500 text-red-400 bg-red-950/30' : 'border-gray-700 text-gray-500'
                }`}>{m.label}</button>
            ))}
          </div>

          {personas.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 max-w-sm">
              {personas.map((persona, index) => (
                <button key={persona.name} onClick={(e) => { e.stopPropagation(); updatePersona(index); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition border ${
                    selectedPersonaIndex === index ? 'border-yellow-500 text-yellow-400 bg-yellow-950/20' : 'border-gray-700 text-gray-500'
                  }`}>{persona.name.replace('AlyraX ', '')}</button>
              ))}
            </div>
          )}

          <div onClick={(e) => e.stopPropagation()}>
            <CallButton
              scenario={`Mode: ${getModeLabel()}`}
              companionId={companion?.id}
              voiceId={companion?.personas?.voice_id}
              companionName={companion?.name}
              personaName={companion?.personas?.name}
              personaTagline={companion?.personas?.tagline}
              promptUsed={companion?.prompt_used}
              userName={userName}
              lastMemory={lastMemory}
            />
          </div>

          <p className="text-xs text-gray-700 uppercase tracking-widest pb-2">Discreet Billing: AA Technical Services</p>
        </div>
      </div>
    </main>
  );
}
