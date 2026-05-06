'use client';
import { vapi } from '@/lib/vapi';
import { useState } from 'react';

export default function CallButton({ scenario }: { scenario: string }) {
  const [calling, setCalling] = useState(false);

  const startSecretCall = async () => {
    setCalling(true);
    try {
      // First arg: assistant ID, second arg: overrides
      await vapi?.start(
        process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID,
        {
          variableValues: { scenario },
          // The URL uses your ENDPOINT ID
          serverUrl: "https://api.runpod.ai/v2/1wsijhcq54l8pb/runsync",
          // The Headers use your API KEY
          headers: {
            "Authorization": "Bearer rpa_JTSI6HZI6H93L8CX1PVFMMCHM6OPOQPDWG8Y4YIK1evgcf"
          }
        }
      );
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
