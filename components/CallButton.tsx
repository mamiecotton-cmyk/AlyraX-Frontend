'use client';
import { vapi } from '@/lib/vapi';
import { type CompanionMemory } from '@/lib/companion-memory';
import { useCallback, useEffect, useRef, useState } from 'react';

type VoiceTranscript = {
  role: 'user' | 'assistant';
  content: string;
};

function isVoiceTranscriptRole(role?: string): role is VoiceTranscript['role'] {
  return role === 'user' || role === 'assistant';
}

function pickGreeting(options: string[], salt: string) {
  const minuteBucket = Math.floor(Date.now() / 60000);
  const nameWeight = [...salt].reduce((total, char) => total + char.charCodeAt(0), 0);
  return options[(minuteBucket + nameWeight) % options.length];
}

export default function CallButton({
  scenario,
  companionId,
  voiceId,
  companionName,
  personaName,
  personaTagline,
  archetypeId,
  promptUsed,
  userName,
  lastMemory,
  voiceLoading = false,
  autoStart = false,
}: {
  scenario: string;
  companionId?: string;
  voiceId?: string | null;
  companionName?: string | null;
  personaName?: string | null;
  personaTagline?: string | null;
  archetypeId?: string | null;
  promptUsed?: string | null;
  userName?: string | null;
  lastMemory?: CompanionMemory | null;
  voiceLoading?: boolean;
  autoStart?: boolean;
}) {
  const [calling, setCalling] = useState(false);
  const [connected, setConnected] = useState(false);
  const messagesRef = useRef<VoiceTranscript[]>([]);
  const autoStartedRef = useRef(false);
  const isVideoMode = scenario.toLowerCase().includes('video');
  const fallbackVoiceId = process.env.NEXT_PUBLIC_CARTESIA_VOICE_ID || '';
  const hasVoice = Boolean(voiceId || fallbackVoiceId);

  useEffect(() => {
    if (!vapi) return;
    const saveMemory = async () => {
      const messages = messagesRef.current;
      messagesRef.current = [];
      if (!companionId || messages.length < 2) return;

      try {
        await fetch('/api/companion/memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companionId,
            messages,
            mode: isVideoMode ? 'solo_video' : 'solo',
          }),
          keepalive: true,
        });
      } catch (error) {
        console.error('Voice memory save failed:', error);
      }
    };

    const onStart = () => {
      messagesRef.current = [];
      setCalling(false);
      setConnected(true);
    };
    const onEnd = () => {
      setCalling(false);
      setConnected(false);
      void saveMemory();
    };
    const onMessage = (message: { type?: string; role?: string; transcript?: string }) => {
      if (message.type !== 'transcript' || !message.transcript) return;
      if (!isVoiceTranscriptRole(message.role)) return;
      messagesRef.current = [
        ...messagesRef.current,
        { role: message.role, content: message.transcript },
      ].slice(-24);
    };
    vapi.on('call-start', onStart);
    vapi.on('call-end', onEnd);
    vapi.on('message', onMessage);
    return () => {
      vapi?.off('call-start', onStart);
      vapi?.off('call-end', onEnd);
      vapi?.off('message', onMessage);
    };
  }, [companionId, isVideoMode]);

  const buildVoiceGreeting = useCallback(() => {
    const persona = `${personaName || ''} ${personaTagline || ''}`.toLowerCase();
    const address = userName || 'baby';
    const name = companionName || 'me';
    const memory = lastMemory?.lastUserMessage
      ? ` I remember where we left off.`
      : '';
    const memoryWarmth = lastMemory?.lastUserMessage
      ? ` I was thinking about what you said last time.`
      : '';

    if (persona.includes('dominant')) {
      return pickGreeting([
        `There you are, ${address}.${memory} I was wondering when you'd come back to me.`,
        `${address}. Good. I wanted your voice in my ear today.${memoryWarmth}`,
        `Hey, ${address}. It's ${name}. Take a breath and stay with me for a minute.`,
      ], `${name}-${address}-dominant`);
    }

    if (persona.includes('submissive')) {
      return pickGreeting([
        `Hi ${address}.${memory} I missed hearing from you.`,
        `Hey ${address}, it's ${name}. I'm right here with you.`,
        `${address}, hi.${memoryWarmth} Tell me what you need from me first.`,
      ], `${name}-${address}-submissive`);
    }

    if (persona.includes('romantic')) {
      return pickGreeting([
        `Hi ${address}.${memory} I like when it's just us like this.`,
        `Hey ${address}, it's ${name}. Come closer for a second.`,
        `${address}, I was hoping you'd call.${memoryWarmth}`,
      ], `${name}-${address}-romantic`);
    }

    if (persona.includes('playful')) {
      return pickGreeting([
        `Hey ${address}.${memory} I knew you'd find your way back to me.`,
        `${address}, there you are. What mood are we causing today?`,
        `It's ${name}. I was just thinking you were overdue for some attention.`,
      ], `${name}-${address}-playful`);
    }

    return pickGreeting([
      `Hi ${address}, it's ${name}.${memory} I'm glad you called.`,
      `Hey ${address}. It's ${name}. I wanted a minute with you.`,
      `${address}, hey.${memoryWarmth} Tell me what's been on your mind.`,
      `It's ${name}. I like hearing from you, ${address}.`,
    ], `${name}-${address}-default`);
  }, [companionName, lastMemory?.lastUserMessage, personaName, personaTagline, userName]);

  const startSecretCall = useCallback(async () => {
    if (!hasVoice) return;
    setCalling(true);
    if (!vapi) {
      console.error('Call failed: Deepgram voice client not initialized');
      setCalling(false);
      return;
    }
    try {
      const sharedValues = {
        activeCompanionId: companionId,
        cartesiaVoiceId: voiceId || fallbackVoiceId || undefined,
        companionName: companionName || undefined,
        personaName: personaName || undefined,
        personaTagline: personaTagline || undefined,
        archetypeId: archetypeId || undefined,
        promptUsed: promptUsed || undefined,
        userName: userName || undefined,
        lastMemory: lastMemory?.summary || lastMemory?.lastUserMessage || undefined,
      };

      const name = companionName || 'me';
      const address = userName || 'baby';

      await vapi.start(undefined, isVideoMode ? {
        firstMessage: pickGreeting([
          `It's ${name}. Tell me what you want to see${userName ? `, ${userName}` : ''}.`,
          `${address}, give me the scene. I'll make it worth the wait.`,
          `Hey ${address}. Start with the mood, and I'll take it from there.`,
        ], `${name}-${address}-video`),
        firstMessageMode: 'assistant-speaks-first',
        variableValues: {
          ...sharedValues,
          mode: 'solo_video',
        },
      } : {
        firstMessage: buildVoiceGreeting(),
        firstMessageMode: 'assistant-speaks-first',
        variableValues: {
          ...sharedValues,
          mode: 'solo',
        },
      });
    } catch (err) {
      console.error("The Mouth failed to open:", err);
      setCalling(false);
    }
  }, [archetypeId, buildVoiceGreeting, companionId, companionName, fallbackVoiceId, hasVoice, isVideoMode, lastMemory, personaName, personaTagline, promptUsed, userName, voiceId]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current || calling || connected || !hasVoice) return;
    autoStartedRef.current = true;
    void startSecretCall();
  }, [autoStart, calling, connected, hasVoice, startSecretCall]);

  const endCall = () => {
    vapi?.stop();
  };

  if (connected) {
    return (
      <button
        onClick={endCall}
        className="bg-zinc-800 border border-red-600 text-red-500 px-8 py-4 rounded-full font-bold hover:bg-red-600 hover:text-white transition"
      >
        End Chat
      </button>
    );
  }

  return (
    <button
      onClick={startSecretCall}
      disabled={calling || !hasVoice}
      className="bg-red-600 text-white px-8 py-4 rounded-full font-bold hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {calling
        ? "Connecting to AlyraX..."
        : !hasVoice
          ? voiceLoading ? "Loading voice..." : "Voice not assigned"
          : isVideoMode ? "Start Video Call" : "Start Secret Call"}
    </button>
  );
}
