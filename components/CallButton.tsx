'use client';
import { vapi } from '@/lib/vapi';
import { useState, useEffect } from 'react';

export default function CallButton({ scenario }: { scenario: string }) {
  const [calling, setCalling] = useState(false);

  useEffect(() => {
    if (!vapi) return;

    vapi.on('call-start', () => {
      console.log('Call has started');
    });

    return () => {
      vapi?.removeAllListeners();
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
      await vapi.start(assistantId, {
        variableValues: { scenario },
      });
    } catch (err) {
      console.error('Call failed:', err);
      setCalling(false);
    }
  };

  return (
    <button 
      onClick={startSecretCall}
      className="bg-red-600 text-white px-8 py-4 rounded-full font-bold hover:bg-red-700 transition"
    >
      {calling ? "Connecting to AlyraX..." : "Start Secret Call"}
    </button>
  );
}
