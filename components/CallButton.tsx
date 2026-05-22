'use client';
import { vapi } from '@/lib/vapi';
import { type CompanionMemory } from '@/lib/companion-memory';
import { useState, useEffect, useRef } from 'react';

type VoiceTranscript = {
  role: 'user' | 'assistant';
  content: string;
};

function isVoiceTranscriptRole(role?: string): role is VoiceTranscript['role'] {
  return role === 'user' || role === 'assistant';
}

export default function CallButton({
  scenario,
  companionId,
  voiceId,
  companionName,
  personaName,
  personaTagline,
  promptUsed,
  userName,
  lastMemory,
}: {
  scenario: string;
  companionId?: string;
  voiceId?: string | null;
  companionName?: string | null;
  personaName?: string | null;
  personaTagline?: string | null;
  promptUsed?: string | null;
  userName?: string | null;
  lastMemory?: CompanionMemory | null;
}) {
  const [calling, setCalling] = useState(false);
  const [connected, setConnected] = useState(false);
  const messagesRef = useRef<VoiceTranscript[]>([]);
  const isVideoMode = scenario.toLowerCase().includes('video');

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

  const buildVoiceGreeting = () => {
    const persona = `${personaName || ''} ${personaTagline || ''}`.toLowerCase();
    const address = userName || 'baby';
    const memory = lastMemory?.lastUserMessage
      ? ` I remember where we left off.`
      : '';

    if (persona.includes('dominant')) {
      return `There you are, ${address}.${memory} Take a breath and tell me what you want from me.`;
    }

    if (persona.includes('submissive')) {
      return `Hi ${address}.${memory} I'm here with you. Tell me how you want me tonight.`;
    }

    if (persona.includes('romantic')) {
      return `Hi ${address}.${memory} Come closer for me and tell me what mood you're in.`;
    }

    if (persona.includes('playful')) {
      return `Hey ${address}.${memory} I was hoping you'd show up. What kind of trouble are we getting into?`;
    }

    return `Hi ${address}, it's ${companionName || 'me'}.${memory} I'm here now. Tell me what you want.`;
  };

  const startSecretCall = async () => {
    setCalling(true);
    if (!vapi) {
      console.error('Call failed: Deepgram voice client not initialized');
      setCalling(false);
      return;
    }
    try {
      const sharedValues = {
        activeCompanionId: companionId,
        cartesiaVoiceId: voiceId || undefined,
        companionName: companionName || undefined,
        personaName: personaName || undefined,
        personaTagline: personaTagline || undefined,
        promptUsed: promptUsed || undefined,
        userName: userName || undefined,
        lastMemory: lastMemory?.summary || lastMemory?.lastUserMessage || undefined,
      };

      await vapi.start(undefined, isVideoMode ? {
        firstMessage: `Tell me what you want to see${userName ? `, ${userName}` : ''}. Give me the scene, and I'll make it worth the wait.`,
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
  };

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
      disabled={calling}
      className="bg-red-600 text-white px-8 py-4 rounded-full font-bold hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {calling ? "Connecting to AlyraX..." : isVideoMode ? "Start Video Call" : "Start Secret Call"}
    </button>
  );
}
