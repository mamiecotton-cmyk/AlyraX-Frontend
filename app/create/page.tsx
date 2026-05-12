'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type ImageStyle = 'portrait' | 'fullbody' | 'fullscreen';

type Companion = {
  id: string;
  name: string;
  image_url: string;
};

type GeneratedImage = {
  image_url: string;
  seed?: number;
  width?: number;
  height?: number;
};

const styleOptions: Array<{ key: ImageStyle; label: string; size: string }> = [
  { key: 'portrait', label: 'Portrait', size: '512 x 1024' },
  { key: 'fullbody', label: 'Full Body', size: '768 x 1024' },
  { key: 'fullscreen', label: 'Full Screen', size: '1024 x 1792' },
];

export default function CreatePage() {
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [companion, setCompanion] = useState<Companion | null>(null);
  const [prompt, setPrompt] = useState('');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [style, setStyle] = useState<ImageStyle>('portrait');
  const [steps, setSteps] = useState(20);
  const [guidance, setGuidance] = useState(3.5);
  const [seed, setSeed] = useState('');
  const [lastSeed, setLastSeed] = useState<number | null>(null);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageStatus, setImageStatus] = useState('');
  const [videoStatus, setVideoStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        router.push('/login');
        return;
      }

      setUserId(user.id);
      const activeCompanionId = user.user_metadata?.active_companion_id;
      let companionQuery = supabase
        .from('companions')
        .select('id, name, image_url')
        .eq('user_id', user.id);

      if (activeCompanionId) companionQuery = companionQuery.eq('id', activeCompanionId);

      const { data } = await companionQuery.limit(1).maybeSingle();
      if (!active) return;

      if (!data) {
        router.push('/onboarding');
        return;
      }

      setCompanion(data);
      setLoading(false);
    }

    loadData();
    return () => { active = false; };
  }, [router, supabase]);

  async function pollVideo(predictionId: string) {
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      setVideoStatus(`Rendering video ${Math.min(attempt + 1, 120)}/120`);

      const response = await fetch('/api/generate-video/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictionId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Video status failed');
      if (data.video_url) return `/api/video-proxy?url=${encodeURIComponent(data.video_url as string)}`;
    }

    throw new Error('Video generation timed out');
  }

  async function generateImage() {
    if (!prompt.trim()) return;
    setError('');
    setVideoUrl(null);
    setImageStatus('Generating image');
    setGeneratedImage(null);

    try {
      const response = await fetch('/api/generate-companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: prompt.trim(),
          style,
          num_inference_steps: steps,
          guidance_scale: guidance,
          seed: seed.trim() ? Number(seed) : -1,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Image generation failed');

      setGeneratedImage({
        image_url: data.image_url,
        seed: data.seed,
        width: data.width,
        height: data.height,
      });
      if (typeof data.seed === 'number') setLastSeed(data.seed);
      setImageStatus('Image ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image generation failed');
      setImageStatus('');
    }
  }

  async function generateVideo() {
    if (!generatedImage?.image_url || !userId || !companion || !prompt.trim()) return;
    setError('');
    setVideoUrl(null);
    setVideoStatus('Starting video');

    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          companionId: companion.id,
          userMessage: (videoPrompt || prompt).trim(),
          frameUrl: generatedImage.image_url,
          wardrobeState: 'clothed',
          conversationHistory: [
            { role: 'user', content: prompt.trim() },
            { role: 'assistant', content: (videoPrompt || prompt).trim() },
          ],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Video generation failed');
      if (!data.prediction_id) throw new Error('No video prediction returned');

      const readyVideoUrl = await pollVideo(data.prediction_id);
      setVideoUrl(readyVideoUrl);
      setVideoStatus('Video ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video generation failed');
      setVideoStatus('');
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-500">
        <p className="text-xs uppercase tracking-[0.35em]">Loading</p>
      </main>
    );
  }

  const canGenerateImage = prompt.trim().length > 0 && imageStatus !== 'Generating image';
  const canGenerateVideo = Boolean(generatedImage?.image_url && userId && companion && videoStatus !== 'Starting video' && !videoStatus.startsWith('Rendering'));

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 lg:grid-cols-[420px_1fr]">
        <section className="border-b border-zinc-800/80 bg-zinc-950 px-5 py-5 lg:border-b-0 lg:border-r">
          <div className="mb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500 transition hover:text-zinc-100"
            >
              Dashboard
            </button>
            <span className="text-xs text-red-300">{companion?.name}</span>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={8}
                placeholder="Luxury mahogany office, sharp designer suit, confident posture, professional lighting"
                className="w-full resize-none border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-red-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {styleOptions.map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setStyle(option.key)}
                  className={`min-h-20 border px-2 py-3 text-left transition ${
                    style === option.key
                      ? 'border-red-500 bg-red-950/30 text-white'
                      : 'border-zinc-800 bg-black text-zinc-500 hover:border-zinc-600'
                  }`}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-2 block text-[11px] text-zinc-500">{option.size}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500">Steps</span>
                <input
                  value={steps}
                  min={10}
                  max={40}
                  type="number"
                  onChange={(event) => setSteps(Number(event.target.value))}
                  className="h-11 w-full border border-zinc-800 bg-black px-3 text-sm outline-none focus:border-red-500"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500">Guidance</span>
                <input
                  value={guidance}
                  min={1}
                  max={8}
                  step={0.1}
                  type="number"
                  onChange={(event) => setGuidance(Number(event.target.value))}
                  className="h-11 w-full border border-zinc-800 bg-black px-3 text-sm outline-none focus:border-red-500"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500">Seed</span>
                <input
                  value={seed}
                  inputMode="numeric"
                  onChange={(event) => setSeed(event.target.value)}
                  placeholder="Random"
                  className="h-11 w-full border border-zinc-800 bg-black px-3 text-sm outline-none placeholder:text-zinc-700 focus:border-red-500"
                />
              </label>
            </div>

            {lastSeed !== null && (
              <div className="flex items-center justify-between border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-500">
                <span>Last seed {lastSeed}</span>
                <button
                  type="button"
                  onClick={() => setSeed(String(lastSeed))}
                  className="font-semibold uppercase tracking-[0.18em] text-red-300 transition hover:text-red-200"
                >
                  Use Seed
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={!canGenerateImage}
              onClick={generateImage}
              className="h-12 w-full bg-red-600 text-sm font-bold uppercase tracking-[0.25em] text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {imageStatus === 'Generating image' ? 'Generating' : 'Generate Image'}
            </button>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                Video Prompt
              </label>
              <textarea
                value={videoPrompt}
                onChange={(event) => setVideoPrompt(event.target.value)}
                rows={4}
                placeholder="Slow camera push-in, steady eye contact, subtle hand movement"
                className="w-full resize-none border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-red-500"
              />
            </div>

            <button
              type="button"
              disabled={!canGenerateVideo}
              onClick={generateVideo}
              className="h-12 w-full border border-yellow-500/60 bg-yellow-500/10 text-sm font-bold uppercase tracking-[0.25em] text-yellow-200 transition hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
            >
              {videoStatus && videoStatus !== 'Video ready' ? 'Rendering' : 'Generate Video'}
            </button>

            {(imageStatus || videoStatus || error) && (
              <div className="min-h-10 border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-500">
                {error || videoStatus || imageStatus}
              </div>
            )}
          </div>
        </section>

        <section className="relative flex min-h-[70vh] items-center justify-center bg-black p-5">
          {generatedImage?.image_url ? (
            <>
              <img
                src={generatedImage.image_url}
                alt="Generated"
                className={`max-h-[calc(100dvh-40px)] w-full object-contain ${
                  style === 'fullscreen' ? 'h-[calc(100dvh-40px)] object-cover' : ''
                }`}
              />
              {videoUrl && (
                <video
                  src={videoUrl}
                  className="absolute inset-0 h-full w-full bg-black object-contain"
                  controls
                  autoPlay
                  playsInline
                />
              )}
              <div className="absolute bottom-5 left-5 right-5 flex flex-wrap items-center justify-between gap-2 bg-black/70 px-4 py-3 text-xs text-zinc-400 backdrop-blur">
                <span>{generatedImage.width} x {generatedImage.height}</span>
                <span>Seed {generatedImage.seed ?? lastSeed ?? 'Random'}</span>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[60vh] w-full items-center justify-center border border-dashed border-zinc-800 text-center">
              <p className="max-w-xs text-sm text-zinc-600">Generated media appears here.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
