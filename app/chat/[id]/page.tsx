'use client';

import { use, useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { archetypes, type Archetype } from '@/lib/archetypes';
import { createClient } from '@/lib/supabase';
import { formatFactsSummary, normalizeFacts } from '@/lib/companion-facts';
import Sidebar from '@/components/Sidebar';
import { vapi } from '@/lib/vapi';
import dynamic from 'next/dynamic';

const CallButton = dynamic(() => import('@/components/CallButton'), { ssr: false });

type Message = {
  id: string;
  conversation_id: string;
  role: 'user' | 'companion';
  content: string | null;
  media_type: 'image' | 'video' | null;
  media_url: string | null;
  media_status: 'generating' | 'ready' | 'failed' | null;
  media_prompt: string | null;
  poll_attempt?: number;
  source_frame_url?: string;
  created_at: string;
};

type Relationship = {
  nickname: string | null;
  companion_nickname: string | null;
  conversation_count: number;
  first_met_at: string;
  last_talked_at: string | null;
};

type ChatCompanion = {
  id: string;
  image_url: string | null;
  personas: { voice_id: string | null } | { voice_id: string | null }[] | null;
};

type PersonaVoice = {
  voice_id: string | null;
};

type ViewerState = {
  url: string;
  type: 'image' | 'video';
} | null;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function timeSince(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const months = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30));
  if (months < 1) return 'Just met';
  if (months === 1) return '1 month';
  return `${months} months`;
}

function getMediaDownloadName(message: Message) {
  const type = message.media_type === 'video' ? 'video' : 'image';
  const extension = message.media_url?.split('?')[0].split('.').pop();
  const safeExtension = extension && extension.length <= 5 ? extension : type === 'video' ? 'mp4' : 'jpg';
  return `alyrax-${type}-${message.id}.${safeExtension}`;
}

function getDownloadUrl(url: string, filename: string) {
  return `/api/video-proxy?url=${encodeURIComponent(url)}&download=${encodeURIComponent(filename)}`;
}

function getViewerDownloadName(viewer: ViewerState) {
  if (!viewer) return 'alyrax-media';
  const extension = viewer.url.split('?')[0].split('.').pop();
  const safeExtension = extension && extension.length <= 5 ? extension : viewer.type === 'video' ? 'mp4' : 'jpg';
  return `alyrax-${viewer.type}.${safeExtension}`;
}

function isVoiceMediaRequest(message: string) {
  const lower = message.toLowerCase();
  return (
    /\b(selfie|pic|picture|photo|image|portrait|shot|snap)\b/.test(lower)
    || /\b(send|show|take|make|create)\s+(me\s+)?(a\s+|an\s+|some\s+)?(selfie|pic|picture|photo|image|portrait|shot|snap)\b/.test(lower)
    || /\bwhat (are|do) you look(ing)?\b/.test(lower)
    || /\bwhat('re| are) you wearing\b/.test(lower)
  );
}

// ── Media Message Component ─────────────────────────────────────────────────
function MediaMessage({
  message,
  archetype,
  onRegenerate,
  onView,
}: {
  message: Message;
  archetype: Archetype;
  onRegenerate: (msg: Message) => void;
  onView: (url: string, type: 'image' | 'video') => void;
}) {
  const isGenerating = message.media_status === 'generating';
  const isFailed = message.media_status === 'failed';
  const isReady = message.media_status === 'ready' && message.media_url;

  return (
    <div style={{ maxWidth: '260px' }}>
      {isGenerating && (
        <div style={{ position: 'relative', width: '220px', height: '280px', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#111' }}>
          {message.source_frame_url && message.media_type === 'video' ? (
            <img
              src={message.source_frame_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'brightness(0.85)' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', background: archetype.imageGradient }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.75) 100%)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--gold, #c9a84c)', animation: 'spin 1.2s ease-in-out infinite' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>
                {(() => {
                  const pct = ((message.poll_attempt ?? 0) / 120) * 100;
                  if (pct < 34) return 'Setting the scene...';
                  if (pct < 67) return 'Almost there...';
                  return 'Finishing up...';
                })()}
              </span>
            </div>
            <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.15)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--gold, #c9a84c)', borderRadius: '2px', width: `${Math.min(99, ((message.poll_attempt ?? 0) / 120) * 100)}%`, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        </div>
      )}

      {isFailed && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(192,57,43,0.1)',
          border: '1px solid rgba(192,57,43,0.3)',
          borderRadius: '12px',
          fontSize: '12px',
          color: '#c0392b',
        }}>
          {message.media_type === 'video' ? 'Video' : 'Photo'} failed
          <button
            onClick={() => onRegenerate(message)}
            style={{ display: 'block', marginTop: '6px', background: 'none', border: 'none', color: '#e63946', cursor: 'pointer', fontSize: '11px', padding: 0 }}
          >
            Try again ↺
          </button>
        </div>
      )}

      {isReady && message.media_url && (
        <div style={{ position: 'relative' }}>
          {message.media_type === 'image' || message.media_url.includes('.webp') ? (
            <img
              src={message.media_url}
              alt="companion photo"
              onClick={() => onView(message.media_url!, message.media_type ?? 'image')}
              style={{
                width: '220px',
                height: '280px',
                objectFit: 'cover',
                objectPosition: 'center top',
                borderRadius: '16px',
                cursor: 'pointer',
                display: 'block',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          ) : (
            <video
              src={message.media_url}
              onClick={() => onView(message.media_url!, 'video')}
              autoPlay
              loop
              muted
              playsInline
              style={{
                width: '220px',
                height: '280px',
                objectFit: 'cover',
                borderRadius: '16px',
                cursor: 'pointer',
                display: 'block',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          )}
          <a
            href={getDownloadUrl(message.media_url, getMediaDownloadName(message))}
            download={getMediaDownloadName(message)}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '8px',
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '20px',
              padding: '4px 10px',
              color: '#ffffff',
              fontSize: '10px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em',
              textDecoration: 'none',
            }}
          >
            ↓ Save
          </a>
          <button
            onClick={() => onRegenerate(message)}
            style={{
              position: 'absolute',
              bottom: '8px',
              right: '8px',
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '20px',
              padding: '4px 10px',
              color: '#ffffff',
              fontSize: '10px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em',
            }}
          >
            ↺ New
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const archetype = archetypes.find(a => a.id === id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [calling, setCalling] = useState(false);
  const [callStatus, setCallStatus] = useState('idle');
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [companionNicknameInput, setCompanionNicknameInput] = useState('');
  const [viewer, setViewer] = useState<ViewerState>(null);
  const [archetypeImage, setArchetypeImage] = useState<string | null>(null);
  const [chatCompanion, setChatCompanion] = useState<ChatCompanion | null>(null);
  const [personaVoice, setPersonaVoice] = useState<PersonaVoice | null>(null);
  const [factsMemory, setFactsMemory] = useState<{ summary: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const mediaGenerationRequestsRef = useRef<Set<string>>(new Set());
  const voiceMediaRequestsRef = useRef<Map<string, number>>(new Map());

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!archetype) { router.push('/dashboard'); return; }
    const selectedArchetype = archetype;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      // Get display name
      const meta = user.user_metadata as Record<string, string> | undefined;
      const name = meta?.preferred_name || meta?.full_name?.split(' ')[0] || meta?.name?.split(' ')[0] || '';
      setUserName(name);

      // Load conversation
      const res = await fetch(`/api/chat/conversation?archetype_id=${id}`);
      const data = await res.json();
      setConversationId(data.conversation?.id ?? null);
      setMessages(data.messages ?? []);
      setRelationship(data.relationship ?? null);

      const { data: companionData } = await supabase
        .from('companions')
        .select('id, image_url, personas(voice_id)')
        .eq('user_id', user.id)
        .eq('archetype_id', id)
        .maybeSingle();

      setChatCompanion((companionData as ChatCompanion | null) ?? null);

      const { data: personaData } = await supabase
        .from('personas')
        .select('voice_id')
        .ilike('name', selectedArchetype.name)
        .maybeSingle();

      setPersonaVoice((personaData as PersonaVoice | null) ?? null);

      const { data: factsRow } = await supabase
        .from('companion_facts')
        .select('facts')
        .eq('user_id', user.id)
        .eq('archetype_id', id)
        .maybeSingle();

      const facts = normalizeFacts(factsRow?.facts);
      setFactsMemory(facts.length ? { summary: formatFactsSummary(facts) } : null);
      setLoading(false);
    }

    load();
  }, [id, archetype, router, supabase]);

  // Load archetype media
  useEffect(() => {
    fetch('/api/archetypes/images', { cache: 'no-store' })
      .then(r => r.json())
      .then(({ images }) => setArchetypeImage(images?.[id] ?? null))
      .catch(() => {});
  }, [id]);

  // Vapi call events
  useEffect(() => {
    if (!vapi) return;
    vapi.on('call-start', () => { setCallStatus('connected'); setCalling(true); });
    vapi.on('call-end', () => { setCallStatus('idle'); setCalling(false); });
    vapi.on('speech-start', () => setCallStatus('speaking'));
    vapi.on('speech-end', () => setCallStatus('listening'));
    return () => { vapi?.removeAllListeners(); };
  }, []);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup polling on unmount
  useEffect(() => {
    const timers = pollingRef.current;
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, []);

  // ── Poll for media completion ──────────────────────────────────────────────
  const pollMediaJob = useCallback(async (
    messageId: string,
    jobId: string,
    mediaType: 'image' | 'video',
    provider?: string,
  ) => {
    const poll = async (attempt: number) => {
      if (attempt > 120) {
        await fetch('/api/chat/media/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: messageId, status: 'failed' }),
        });
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, media_status: 'failed' } : m
        ));
        return;
      }

      await new Promise(r => setTimeout(r, 4000));
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, poll_attempt: (m.poll_attempt ?? 0) + 1 } : m
      ));

      try {
        let res: Response;
        let data: Record<string, unknown>;

        if (mediaType === 'image') {
          res = await fetch(`/api/generate-companion/status/${jobId}`);
          data = await res.json();
          if (data.image_url) {
            await fetch('/api/chat/media/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message_id: messageId, media_url: data.image_url, status: 'ready' }),
            });
            setMessages(prev => prev.map(m =>
              m.id === messageId ? { ...m, media_status: 'ready', media_url: data.image_url as string } : m
            ));
            return;
          }
        } else {
          res = await fetch('/api/generate-video/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ predictionId: jobId, provider: provider ?? 'runpod' }),
          });
          data = await res.json();
          if (data.video_url) {
            await fetch('/api/chat/media/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message_id: messageId, media_url: data.video_url, status: 'ready' }),
            });
            setMessages(prev => prev.map(m =>
              m.id === messageId ? { ...m, media_status: 'ready', media_url: data.video_url as string } : m
            ));
            return;
          }
          if (data.status === 'failed') {
            await fetch('/api/chat/media/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message_id: messageId, status: 'failed' }),
            });
            setMessages(prev => prev.map(m =>
              m.id === messageId ? { ...m, media_status: 'failed' } : m
            ));
            return;
          }
        }

        const timer = setTimeout(() => poll(attempt + 1), 0);
        pollingRef.current.set(messageId, timer);
      } catch {
        const timer = setTimeout(() => poll(attempt + 1), 0);
        pollingRef.current.set(messageId, timer);
      }
    };

    const timer = setTimeout(() => poll(0), 0);
    pollingRef.current.set(messageId, timer);
  }, []);

  // ── Start media generation for a placeholder message ──────────────────────
  const startMediaGeneration = useCallback(async (msg: Message) => {
    if (!msg.media_prompt || !msg.media_type) return;
    if (mediaGenerationRequestsRef.current.has(msg.id)) return;

    mediaGenerationRequestsRef.current.add(msg.id);

    try {
      const res = await fetch('/api/chat/media/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: msg.id,
          archetype_id: id,
          media_type: msg.media_type,
          media_prompt: msg.media_prompt,
        }),
      });

      const data = await res.json().catch(() => ({})) as Record<string, unknown>;

      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Media generation failed');
      }

      if (data.status === 'ready' && typeof data.image_url === 'string') {
        const imageUrl = data.image_url;
        setMessages(prev => prev.map(m =>
          m.id === msg.id ? { ...m, media_status: 'ready', media_url: imageUrl } : m
        ));
        return;
      }

      if (typeof data.jobId === 'string') {
        if (typeof data.source_frame_url === 'string') {
          const sourceFrameUrl = data.source_frame_url;
          setMessages(prev => prev.map(m =>
            m.id === msg.id
              ? { ...m, source_frame_url: sourceFrameUrl, poll_attempt: 0 }
              : m
          ));
        }
        pollMediaJob(msg.id, data.jobId, msg.media_type, typeof data.provider === 'string' ? data.provider : undefined);
        return;
      }
      throw new Error('No media job returned');
    } catch (error) {
      console.error('Media generation failed:', error);
      await fetch('/api/chat/media/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: msg.id, status: 'failed' }),
      }).catch(() => {});
      setMessages(prev => prev.map(m =>
        m.id === msg.id ? { ...m, media_status: 'failed' } : m
      ));
    } finally {
      mediaGenerationRequestsRef.current.delete(msg.id);
    }
  }, [id, pollMediaJob]);

  const handleVoiceTranscript = useCallback(async (transcript: string) => {
    if (!conversationId || !archetype) return;

    const normalized = transcript.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized || !isVoiceMediaRequest(normalized)) return;

    const now = Date.now();
    const lastRequestedAt = voiceMediaRequestsRef.current.get(normalized);
    if (lastRequestedAt && now - lastRequestedAt < 120_000) return;
    voiceMediaRequestsRef.current.set(normalized, now);

    try {
      const res = await fetch('/api/chat/media/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          archetype_id: id,
          message: transcript,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error || 'Photo request failed');
        return;
      }

      const incoming = [data.userMessage, data.mediaMessage].filter(Boolean) as Message[];
      if (incoming.length) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          return [...prev, ...incoming.filter(m => !existingIds.has(m.id))];
        });
      }

      if (data.mediaMessage) {
        await startMediaGeneration(data.mediaMessage);
      }
    } catch {
      setSendError('Photo request failed');
    }
  }, [archetype, conversationId, id, startMediaGeneration]);

  // Auto-start generation for any generating messages on load
  useEffect(() => {
    messages.forEach(m => {
      if (m.media_status === 'generating' && !pollingRef.current.has(m.id)) {
        startMediaGeneration(m);
      }
    });
  }, [messages, startMediaGeneration]);

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || !conversationId || sending) return;
    const text = input.trim();
    setInput('');
    setSendError(null);
    setSending(true);

    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      conversation_id: conversationId,
      role: 'user',
      content: text,
      media_type: null,
      media_url: null,
      media_status: null,
      media_prompt: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const history = messages.slice(-20).map(m => ({
        role: m.role,
        content: m.content ?? '',
      }));

      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          archetype_id: id,
          message: text,
          history,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages(prev => {
          const without = prev.filter(m => m.id !== tempId);
          return data.userMessage ? [...without, data.userMessage] : prev;
        });
        setSendError(data.error || 'Message failed to send');
        setSending(false);
        inputRef.current?.focus();
        return;
      }

      // Replace optimistic message + add companion response
      setMessages(prev => {
        const without = prev.filter(m => m.id !== tempId);
        const next = [...without];
        if (data.userMessage) next.push(data.userMessage);
        if (data.companionMessage) next.push(data.companionMessage);
        if (data.mediaMessage) next.push(data.mediaMessage);
        return next;
      });

      // Start media generation if needed
      if (data.mediaMessage) {
        await startMediaGeneration(data.mediaMessage);
      }
    } catch {
      setSendError('Message failed to send');
    }

    setSending(false);
    inputRef.current?.focus();
  }

  // ── Regenerate media ──────────────────────────────────────────────────────
  async function regenerateMedia(msg: Message) {
    // Reset status to generating
    setMessages(prev => prev.map(m =>
      m.id === msg.id ? { ...m, media_status: 'generating', media_url: null } : m
    ));
    await fetch('/api/chat/media/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: msg.id, status: 'generating', media_url: null }),
    });
    await startMediaGeneration({ ...msg, media_status: 'generating', media_url: null });
  }

  // ── Save nickname ─────────────────────────────────────────────────────────
  async function saveNickname() {
    await fetch('/api/chat/nickname', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        archetype_id: id,
        nickname: nicknameInput || undefined,
        companion_nickname: companionNicknameInput || undefined,
      }),
    });
    setRelationship(prev => prev ? {
      ...prev,
      nickname: nicknameInput || prev.nickname,
      companion_nickname: companionNicknameInput || prev.companion_nickname,
    } : null);
    setShowNicknameModal(false);
  }

  // ── Key handler ───────────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (!archetype) return null;

  const companionDisplayName = relationship?.nickname || archetype.name;
  const linkedCompanionVoiceId = Array.isArray(chatCompanion?.personas)
    ? chatCompanion.personas[0]?.voice_id
    : chatCompanion?.personas?.voice_id;
  const companionVoiceId = linkedCompanionVoiceId || personaVoice?.voice_id;
  const profileImageUrl = archetypeImage || chatCompanion?.image_url || null;
  const mediaUrl = profileImageUrl;

  // Group messages by date for dividers
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  messages.forEach(msg => {
    const date = formatDate(msg.created_at);
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === date) {
      last.messages.push(msg);
    } else {
      groupedMessages.push({ date, messages: [msg] });
    }
  });

  return (
    <div className="chat-shell" style={{ display: 'flex', width: '100%', height: '100dvh', overflow: 'hidden', background: '#080808' }}>
      <Sidebar />

      <div className="chat-layout" style={{ flex: 1, display: 'flex', height: '100dvh', overflow: 'hidden', minWidth: 0 }}>

        {/* ── Companion Presence Panel ──────────────────────────────────────── */}
        <div className="chat-presence-panel" style={{
          width: '300px',
          minWidth: '300px',
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          background: '#0a0a0a',
          borderRight: '1px solid #1a1a1a',
          overflow: 'hidden',
          position: 'relative',
        }}>
          {/* Media */}
          <div style={{ position: 'relative', width: '100%', height: '380px', overflow: 'hidden', flexShrink: 0 }}>
            {mediaUrl ? (
              <img
                src={mediaUrl}
                alt={companionDisplayName}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: archetype.imageGradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '64px', color: 'rgba(255,255,255,0.1)' }}>{archetype.name[0]}</div>
              </div>
            )}
            {/* Gradient overlay */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, #0a0a0a 100%)', pointerEvents: 'none' }} />

            {/* Online badge */}
            <div style={{ position: 'absolute', top: '12px', left: '12px', display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(0,0,0,0.7)', borderRadius: '20px', padding: '4px 10px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#27ae60', animation: 'pulse 2s infinite' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', color: '#ffffff' }}>Online</span>
            </div>
          </div>

          {/* Info */}
          <div style={{ padding: '0 20px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: '#ffffff', lineHeight: 1, marginBottom: '4px' }}>
                {companionDisplayName}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#e63946' }}>
                {archetype.archetype}
              </div>
            </div>

            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', lineHeight: 1.5 }}>
              &ldquo;{archetype.tagline}&rdquo;
            </div>

            {/* Relationship stats */}
            {relationship && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { label: 'Known', val: timeSince(relationship.first_met_at) },
                  { label: 'Chats', val: String(relationship.conversation_count || 0) },
                ].map(s => (
                  <div key={s.label} style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '3px' }}>{s.label}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: '#ffffff' }}>{s.val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
              {/* Voice call */}
              <CallButton
                scenario="Mode: solo"
                companionId={chatCompanion?.id}
                voiceId={companionVoiceId}
                companionName={companionDisplayName}
                personaName={archetype.archetype}
                personaTagline={archetype.tagline}
                archetypeId={id}
                userName={userName}
                lastMemory={factsMemory}
                onUserTranscript={handleVoiceTranscript}
                voiceLoading={loading}
                autoStart={searchParams.get('call') === '1'}
              />

              <button
                onClick={() => router.push(`/dossier/${id}`)}
                style={{ padding: '10px', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >
                View Dossier
              </button>

              <button
                onClick={() => {
                  setNicknameInput(relationship?.nickname ?? '');
                  setCompanionNicknameInput(relationship?.companion_nickname ?? '');
                  setShowNicknameModal(true);
                }}
                style={{ padding: '10px', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >
                ✎ Nicknames
              </button>
            </div>
          </div>
        </div>

        {/* ── Chat Area ────────────────────────────────────────────────────── */}
        <div className="chat-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100dvh', minWidth: 0 }}>

          {/* Header */}
          <div className="chat-header" style={{ padding: '16px 24px', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', background: archetype.imageGradient, flexShrink: 0 }}>
                {profileImageUrl && <img src={profileImageUrl} alt={companionDisplayName} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: '#ffffff', lineHeight: 1 }}>{companionDisplayName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: calling ? '#e63946' : '#27ae60' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)' }}>
                    {calling ? callStatus.toUpperCase() : 'ONLINE'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: '20px' }}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {loading && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em' }}>
                LOADING...
              </div>
            )}

            {!loading && messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>
                  Say hello to {companionDisplayName}
                </div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                  {archetype.tagline}
                </div>
              </div>
            )}

            {groupedMessages.map(group => (
              <div key={group.date}>
                {/* Date divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0 12px' }}>
                  <div style={{ flex: 1, height: '1px', background: '#1a1a1a' }} />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>{group.date}</div>
                  <div style={{ flex: 1, height: '1px', background: '#1a1a1a' }} />
                </div>

                {group.messages.map((msg, i) => {
                  const isUser = msg.role === 'user';
                  const prevMsg = group.messages[i - 1];
                  const showAvatar = !isUser && (!prevMsg || prevMsg.role === 'user');
                  const isMedia = msg.media_type != null;

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        justifyContent: isUser ? 'flex-end' : 'flex-start',
                        alignItems: 'flex-end',
                        gap: '8px',
                        marginBottom: '3px',
                      }}
                    >
                      {/* Companion avatar */}
                      {!isUser && (
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', background: archetype.imageGradient, flexShrink: 0, opacity: showAvatar ? 1 : 0 }}>
                          {profileImageUrl && showAvatar && <img src={profileImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />}
                        </div>
                      )}

                      <div className="chat-message-content" style={{ maxWidth: isMedia ? 'auto' : '65%' }}>
                        {isMedia ? (
                          <MediaMessage
                            message={msg}
                            archetype={archetype}
                            onRegenerate={regenerateMedia}
                            onView={(url, type) => setViewer({ url, type })}
                          />
                        ) : msg.content ? (
                          <div>
                            <div style={{
                              padding: '10px 14px',
                              background: isUser ? '#e63946' : '#1a1a1a',
                              borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                              color: '#ffffff',
                              fontSize: '14px',
                              lineHeight: 1.5,
                              fontFamily: 'var(--font-body)',
                              wordBreak: 'break-word',
                            }}>
                              {msg.content}
                            </div>
                            <div style={{
                              fontSize: '10px',
                              color: 'rgba(255,255,255,0.2)',
                              marginTop: '2px',
                              textAlign: isUser ? 'right' : 'left',
                              fontFamily: 'var(--font-mono)',
                            }}>
                              {formatTime(msg.created_at)}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Typing indicator */}
            {sending && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', background: archetype.imageGradient, flexShrink: 0 }}>
                  {profileImageUrl && <img src={profileImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />}
                </div>
                <div style={{ padding: '10px 16px', background: '#1a1a1a', borderRadius: '18px 18px 18px 4px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.4)', animation: `typingDot 1.2s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-panel" style={{ padding: '16px 24px', borderTop: '1px solid #1a1a1a', background: '#0a0a0a', flexShrink: 0 }}>
            {sendError && (
              <div style={{ marginBottom: '10px', color: '#ff8a8a', fontSize: '12px', fontFamily: 'var(--font-body)' }}>
                {sendError}
              </div>
            )}

            {/* Quick suggestions */}
            <div className="chat-suggestions" style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
              {['Send me a selfie 📸', 'Make a video for me 🎬', 'How are you?', 'What are you up to?'].map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  style={{
                    padding: '5px 12px',
                    background: '#141414',
                    border: '1px solid #2a2a2a',
                    borderRadius: '20px',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e63946'; (e.currentTarget as HTMLButtonElement).style.color = '#ffffff'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a2a'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'; }}
                >
                  {s}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${companionDisplayName}...`}
                rows={1}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: '#141414',
                  border: '1px solid #2a2a2a',
                  borderRadius: '24px',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontFamily: 'var(--font-body)',
                  outline: 'none',
                  resize: 'none',
                  lineHeight: 1.5,
                  maxHeight: '120px',
                  overflowY: 'auto',
                }}
                onFocus={e => (e.target.style.borderColor = '#e63946')}
                onBlur={e => (e.target.style.borderColor = '#2a2a2a')}
                onInput={e => {
                  const t = e.currentTarget;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: input.trim() ? '#e63946' : '#1a1a1a',
                  border: 'none',
                  cursor: input.trim() ? 'pointer' : 'not-allowed',
                  color: '#ffffff',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.15s',
                }}
              >
                ▶
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Nickname Modal ──────────────────────────────────────────────────── */}
      {showNicknameModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowNicknameModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: '16px', padding: '28px', width: '360px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: '#ffffff', marginBottom: '20px' }}>Nicknames</div>

            <label style={{ display: 'block', marginBottom: '14px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>
                What do you call {archetype.name}?
              </div>
              <input
                value={nicknameInput}
                onChange={e => setNicknameInput(e.target.value)}
                placeholder={archetype.name}
                style={{ width: '100%', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#ffffff', fontSize: '14px', fontFamily: 'var(--font-body)', outline: 'none' }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '20px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>
                What does {archetype.name} call you?
              </div>
              <input
                value={companionNicknameInput}
                onChange={e => setCompanionNicknameInput(e.target.value)}
                placeholder={userName || 'baby'}
                style={{ width: '100%', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#ffffff', fontSize: '14px', fontFamily: 'var(--font-body)', outline: 'none' }}
              />
            </label>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowNicknameModal(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: '8px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={saveNickname} style={{ flex: 1, padding: '10px', background: '#e63946', border: 'none', borderRadius: '8px', color: '#ffffff', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 500 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Media Viewer ────────────────────────────────────────────────────── */}
      {viewer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setViewer(null)}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', position: 'relative' }}>
            {viewer.type === 'video' ? (
              <video
                src={viewer.url}
                controls
                autoPlay
                loop
                playsInline
                style={{ maxHeight: '85vh', maxWidth: '85vw', borderRadius: '12px', display: 'block' }}
              />
            ) : (
              <img
                src={viewer.url}
                alt="companion"
                style={{ maxHeight: '85vh', maxWidth: '85vw', borderRadius: '12px', objectFit: 'contain', display: 'block' }}
              />
            )}
            <button
              onClick={() => setViewer(null)}
              style={{ position: 'absolute', top: '12px', right: '12px', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', color: '#ffffff', cursor: 'pointer', fontSize: '14px' }}
            >
              ✕
            </button>
            <a
              href={getDownloadUrl(viewer.url, getViewerDownloadName(viewer))}
              download={getViewerDownloadName(viewer)}
              style={{ position: 'absolute', bottom: '12px', right: '12px', padding: '6px 14px', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '20px', color: '#ffffff', fontSize: '11px', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}
            >
              ↓ Save
            </a>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 760px) {
          html,
          body {
            background: #080808;
            height: auto !important;
            overflow: hidden !important;
          }

          .chat-shell {
            display: block !important;
            width: 100vw !important;
            height: 100svh !important;
            min-height: 0 !important;
            overflow: hidden !important;
            background: #080808 !important;
          }

          .chat-shell .app-sidebar {
            display: none !important;
          }

          .chat-layout {
            width: 100vw !important;
            height: 100svh !important;
            min-width: 0 !important;
            display: block !important;
            overflow: hidden !important;
          }

          .chat-presence-panel {
            display: none !important;
          }

          .chat-area {
            width: 100vw !important;
            height: 100svh !important;
            min-width: 0 !important;
            display: flex !important;
            overflow: hidden !important;
            background: #080808 !important;
          }

          .chat-header {
            padding: calc(env(safe-area-inset-top) + 10px) 14px 12px !important;
            min-height: 68px !important;
          }

          .chat-header button {
            min-width: 38px !important;
            min-height: 38px !important;
          }

          .chat-messages {
            padding: 14px 14px 12px !important;
            min-height: 0 !important;
            -webkit-overflow-scrolling: touch;
          }

          .chat-message-content {
            max-width: min(78vw, 320px) !important;
          }

          .chat-input-panel {
            padding: 10px 12px calc(env(safe-area-inset-bottom) + 12px) !important;
            background: rgba(10,10,10,0.98) !important;
          }

          .chat-suggestions {
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            padding-bottom: 2px !important;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }

          .chat-suggestions::-webkit-scrollbar {
            display: none;
          }

          .chat-suggestions button {
            flex: 0 0 auto !important;
            white-space: nowrap !important;
            min-height: 34px !important;
          }
        }

        @media (max-width: 380px) {
          .chat-message-content {
            max-width: 82vw !important;
          }

          .chat-suggestions button {
            font-size: 10px !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
          }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
