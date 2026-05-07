'use client';
import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { vapi } from '@/lib/vapi';

const CallButton = dynamic(() => import('@/components/CallButton'), {
  ssr: false,
  loading: () => <button className="opacity-50 cursor-not-allowed bg-gray-700 text-white px-8 py-4 rounded-full font-bold">Loading AlyraX...</button>
});

export default function Home() {
  const [scenario, setScenario] = useState("You are my secret side chick, and I'm calling you after work.");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!vapi) return;

    vapi.on('call-start', () => {
      console.log('Call has started');
    });

    vapi.on('video', (track: MediaStreamTrack) => {
      if (videoRef.current) {
        const stream = new MediaStream([track]);
        videoRef.current.srcObject = stream;
      }
    });

    return () => {
      vapi?.removeAllListeners();
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-6 md:p-24">
      <div className="z-10 w-full max-w-md items-center justify-center font-mono text-sm flex flex-col border border-gray-800 p-8 rounded-2xl bg-zinc-900/50 backdrop-blur-2xl">
        <h1 className="text-4xl font-bold mb-2 text-red-600 tracking-tighter">AlyraX</h1>
        <p className="mb-8 text-gray-500 italic text-center">"Your secret is safe with me."</p>
        
        <div className="w-full mb-6">
          <label className="block text-xs uppercase text-gray-500 mb-2 font-bold tracking-widest">Define the Scenario</label>
          <textarea 
            className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-red-500 outline-none transition"
            rows={3}
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          />
        </div>

        <CallButton scenario={scenario} />

        <div className="relative w-full max-w-2xl mx-auto aspect-video bg-black rounded-xl overflow-hidden border-2 border-yellow-500/20 shadow-2xl mt-6">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            poster="/alyra-poster.png"
          />
        </div>
        
        <div className="mt-8 pt-6 border-t border-gray-800 w-full text-center">
          <p className="text-[10px] text-gray-600 uppercase tracking-widest">Discreet Billing: AA Technical Services</p>
        </div>
      </div>
    </main>
  );
}
