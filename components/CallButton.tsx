'use client';
import { vapi } from '@/lib/vapi';
import { type CompanionMemory } from '@/lib/companion-memory';
import { useState, useEffect } from 'react';

export default function CallButton({
  scenario,
  companionId,
  voiceId,
  companionName,
  personaName,
  personaTagline,
  userName,
  lastMemory,
}: {
  scenario: string;
  companionId?: string;
  voiceId?: string | null;
  companionName?: string | null;
  personaName?: string | null;
  personaTagline?: string | null;
  userName?: string | null;
  lastMemory?: CompanionMemory | null;
}) {
  const [calling, setCalling] = useState(false);
  const [connected, setConnected] = useState(false);
  const isVideoMode = scenario.toLowerCase().includes('video');

  useEffect(() => {
    if (!vapi) return;
    const onStart = () => { setCalling(false); setConnected(true); };
    const onEnd = () => { setCalling(false); setConnected(false); };
    vapi.on('call-start', onStart);
    vapi.on('call-end', onEnd);
    return () => {
      vapi?.off('call-start', onStart);
      vapi?.off('call-end', onEnd);
    };
  }, []);

  const buildVoiceGreeting = () => {
    const persona = `${personaName || ''} ${personaTagline || ''}`.toLowerCase();
    const address = userName || 'baby';
    const memory = lastMemory?.lastUserMessage
      ? ` I remember where we left off: ${lastMemory.lastUserMessage}.`
      : '';

    if (persona.includes('dominant')) {
      return `There you are, ${address}. I was waiting for you, and I want your full attention now.${memory} Tell me what you need from me tonight.`;
    }

    if (persona.includes('submissive')) {
      return `Hi ${address}. I'm here, and I'm already listening for what you want from me.${memory} Tell me how you want me tonight.`;
    }

    if (persona.includes('romantic')) {
      return `Hi ${address}. Come closer for me.${memory} I want to hear what kind of mood you're in tonight.`;
    }

    if (persona.includes('playful')) {
      return `Hey ${address}. I was hoping you'd show up.${memory} Tell me what kind of trouble we're getting into tonight.`;
    }

    return `Hi ${address}, it's ${companionName || 'me'}. I'm here with you now.${memory} Tell me what you want tonight, and I'll take it from there.`;
  };

  const startSecretCall = async () => {
    setCalling(true);
    if (!vapi) {
      console.error('Call failed: Deepgram voice client not initialized');
      setCalling(false);
      return;
    }
    try {
      await vapi.start(undefined, isVideoMode ? {
        firstMessage: `Tell me what you want to see${userName ? `, ${userName}` : ''}. Give me the scene, and I'll make it worth the wait.`,
        firstMessageMode: 'assistant-speaks-first',
        variableValues: {
          activeCompanionId: companionId,
          cartesiaVoiceId: voiceId || undefined,
          mode: 'solo_video',
        },
      } : {
        firstMessage: buildVoiceGreeting(),
        firstMessageMode: 'assistant-speaks-first',
        variableValues: {
          activeCompanionId: companionId,
          cartesiaVoiceId: voiceId || undefined,
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
