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
  promptUsed,
  userName,
  lastMemory,
  archetypeCity,
  archetypeBackground,
  archetypeBio,
  archetypeVibe,
  archetypeEnergy,
  recentChatContext,
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
  archetypeCity?: string | null;
  archetypeBackground?: string | null;
  archetypeBio?: string | null;
  archetypeVibe?: string | null;
  archetypeEnergy?: string | null;
  recentChatContext?: string | null;
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
        archetypeCity: archetypeCity || undefined,
        archetypeBackground: archetypeBackground || undefined,
        archetypeBio: archetypeBio || undefined,
        archetypeVibe: archetypeVibe || undefined,
        archetypeEnergy: archetypeEnergy || undefined,
        recentChatContext: recentChatContext || undefined,
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
