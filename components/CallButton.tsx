'use client';
import { vapi } from '@/lib/vapi';
import { useState, useEffect } from 'react';

export default function CallButton({ scenario }: { scenario: string }) {
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

  const startSecretCall = async () => {
    setCalling(true);
    const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
    if (!vapi) {
      console.error('Call failed: VAPI not initialized (missing NEXT_PUBLIC_VAPI_PUBLIC_KEY)');
      setCalling(false);
      return;
    }
    if (!assistantId) {
      console.error('Call failed: missing NEXT_PUBLIC_VAPI_ASSISTANT_ID');
      setCalling(false);
      return;
    }
    try {
      await vapi.start(assistantId, isVideoMode ? {
        firstMessage: "Tell me what you want to see, baby. Give me the scene, and I'll make it worth the wait.",
        firstMessageMode: 'assistant-speaks-first',
      } : undefined);
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
