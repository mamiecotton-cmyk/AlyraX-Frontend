'use client';

import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type ImageStyle = 'portrait' | 'fullbody' | 'fullscreen';
type PackSize = 1 | 5 | 10 | 20;

type Companion = {
  id: string;
  name: string;
  image_url: string;
  prompt_used?: string | null;
};

type CompanionMetadata = {
  prompt?: string;
  fullBodyAnchorUrl?: string;
  nudeAnchorUrl?: string;
  bodyReferenceUrl?: string;
};

type GeneratedImage = {
  id: string;
  image_url: string;
  seed?: number;
  width?: number;
  height?: number;
  prompt: string;
};

type GuidedPrompt = {
  location: string;
  action: string;
  wardrobe: string;
  mood: string;
  camera: string;
  lighting: string;
  details: string;
};

const styleOptions: Array<{ key: ImageStyle; label: string; size: string }> = [
  { key: 'portrait', label: 'Portrait', size: '512 x 1024' },
  { key: 'fullbody', label: 'Full Body', size: '768 x 1024' },
  { key: 'fullscreen', label: 'Full Screen', size: '1024 x 1792' },
];

const packSizes: PackSize[] = [1, 5, 10, 20];

const initialGuidedPrompt: GuidedPrompt = {
  location: '',
  action: '',
  wardrobe: '',
  mood: '',
  camera: 'editorial photography, natural proportions, premium detail',
  lighting: 'cinematic soft key light, realistic skin texture',
  details: '',
};

function buildPrompt(companion: Companion | null, guided: GuidedPrompt) {
  const metadata = parseCompanionMetadata(companion?.prompt_used);
  const identity = metadata.prompt || companion?.name || '';

  return [
    identity && `exact same woman as the selected anchor image, preserve her face, age, ethnicity, hairstyle, body size, body proportions, and overall identity without reinterpretation: ${identity}`,
    guided.action && `required visible action: ${guided.action}`,
    guided.location && `specific location: ${guided.location}`,
    guided.wardrobe && `specific wardrobe: ${guided.wardrobe}`,
    guided.mood && `expression and mood: ${guided.mood}`,
    guided.camera && `camera and framing: ${guided.camera}`,
    guided.lighting && `lighting: ${guided.lighting}`,
    guided.details && `scene details: ${guided.details}`,
    'the anchor image is the source of truth for the woman, do not invent a new woman, do not slim her, do not alter her body size, only interpret requested scene/action/background or additional people, action must be clearly visible, uncropped subject, cohesive character consistency',
  ].filter(Boolean).join(', ');
}

function parseCompanionMetadata(promptUsed?: string | null): CompanionMetadata {
  if (!promptUsed) return {};

  try {
    const parsed = JSON.parse(promptUsed) as CompanionMetadata;
    return parsed && typeof parsed === 'object' ? parsed : { prompt: promptUsed };
  } catch {
    return { prompt: promptUsed };
  }
}

function getCompanionAnchorUrl(companion: Companion | null, style: ImageStyle) {
  if (!companion) return undefined;
  const metadata = parseCompanionMetadata(companion.prompt_used);
  const fullBodyAnchor = metadata.fullBodyAnchorUrl || metadata.nudeAnchorUrl || metadata.bodyReferenceUrl;

  if (style === 'fullbody' || style === 'fullscreen') {
    return fullBodyAnchor || companion.image_url;
  }

  return companion.image_url;
}

export default function CreatePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [selectedCompanionId, setSelectedCompanionId] = useState('');
  const [guided, setGuided] = useState<GuidedPrompt>(initialGuidedPrompt);
  const [prompt, setPrompt] = useState('');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [style, setStyle] = useState<ImageStyle>('portrait');
  const [packSize, setPackSize] = useState<PackSize>(1);
  const [steps, setSteps] = useState(20);
  const [guidance, setGuidance] = useState(3.5);
  const [seed, setSeed] = useState('');
  const [lastSeed, setLastSeed] = useState<number | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageStatus, setImageStatus] = useState('');
  const [videoStatus, setVideoStatus] = useState('');
  const [anchorStatus, setAnchorStatus] = useState('');
  const [error, setError] = useState('');

  const selectedCompanion = useMemo(
    () => companions.find(item => item.id === selectedCompanionId) || companions[0] || null,
    [companions, selectedCompanionId],
  );

  const selectedImage = useMemo(
    () => generatedImages.find(image => image.id === selectedImageId) || generatedImages[0] || null,
    [generatedImages, selectedImageId],
  );

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
      const { data } = await supabase
        .from('companions')
        .select('id, name, image_url, prompt_used')
        .eq('user_id', user.id);

      if (!active) return;

      if (!data || data.length === 0) {
        router.push('/onboarding');
        return;
      }

      const activeCompanionId = user.user_metadata?.active_companion_id;
      setCompanions(data);
      setSelectedCompanionId(activeCompanionId || data[0].id);
      setLoading(false);
    }

    loadData();
    return () => { active = false; };
  }, [router, supabase]);

  function updateGuided(key: keyof GuidedPrompt, value: string) {
    setGuided(current => ({ ...current, [key]: value }));
  }

  function generatePromptFromFields() {
    const nextPrompt = buildPrompt(selectedCompanion, guided);
    setPrompt(nextPrompt);
    return nextPrompt;
  }

  function updateLocalCompanionAnchor(anchorUrl: string) {
    if (!selectedCompanion) return;
    const metadata = parseCompanionMetadata(selectedCompanion.prompt_used);
    const nextPromptUsed = JSON.stringify({
      ...metadata,
      fullBodyAnchorUrl: anchorUrl,
      nudeAnchorUrl: anchorUrl,
      bodyReferenceUrl: anchorUrl,
    });

    setCompanions(current => current.map(item => (
      item.id === selectedCompanion.id
        ? { ...item, prompt_used: nextPromptUsed }
        : item
    )));
  }

  async function saveFullBodyAnchor(anchorUrl: string) {
    if (!selectedCompanion) return;

    const response = await fetch('/api/companion/anchor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companionId: selectedCompanion.id,
        fullBodyAnchorUrl: anchorUrl,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Anchor save failed');

    updateLocalCompanionAnchor(anchorUrl);
  }

  async function uploadFullBodyAnchor(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !userId || !selectedCompanion) return;

    setError('');
    setAnchorStatus('Uploading anchor');

    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
      const fileName = `${userId}/anchors/${selectedCompanion.id}-${Date.now()}.${extension}`;
      const { data, error: uploadError } = await supabase.storage
        .from('companions')
        .upload(fileName, file, {
          contentType: file.type || 'image/png',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('companions')
        .getPublicUrl(data.path);

      await saveFullBodyAnchor(urlData.publicUrl);
      setAnchorStatus('Full-body anchor saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anchor upload failed');
      setAnchorStatus('');
    }
  }

  async function generateFullBodyAnchor() {
    if (!selectedCompanion) return;

    setError('');
    setAnchorStatus('Generating anchor');

    try {
      const metadata = parseCompanionMetadata(selectedCompanion.prompt_used);
      const identity = metadata.prompt || selectedCompanion.name;
      const response = await fetch('/api/generate-companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: [
            `exact same woman as the selected companion profile image: ${identity}`,
            'private full-body character reference, no clothing, neutral standing pose, front-facing, arms slightly away from body',
            'plain studio background, head to toe visible, feet visible, natural posture, preserve exact body size and proportions',
          ].join(', '),
          style: 'fullbody',
          num_inference_steps: Math.max(steps, 30),
          guidance_scale: guidance,
          seed: -1,
          reference_image_url: selectedCompanion.image_url,
          reference_strength: 0.35,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Anchor generation failed');

      await saveFullBodyAnchor(data.image_url);
      setAnchorStatus('Full-body anchor generated and saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anchor generation failed');
      setAnchorStatus('');
    }
  }

  async function useSelectedImageAsAnchor() {
    if (!selectedImage?.image_url) return;

    setError('');
    setAnchorStatus('Saving selected image as anchor');

    try {
      await saveFullBodyAnchor(selectedImage.image_url);
      setAnchorStatus('Selected image saved as anchor');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anchor save failed');
      setAnchorStatus('');
    }
  }

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

  async function generateOneImage(basePrompt: string, index: number): Promise<GeneratedImage> {
    const baseSeed = seed.trim() ? Number(seed) : -1;
    const imageSeed = baseSeed >= 0 ? baseSeed + index : -1;

    const response = await fetch('/api/generate-companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: basePrompt,
        style,
        num_inference_steps: steps,
        guidance_scale: guidance,
        seed: imageSeed,
        reference_image_url: getCompanionAnchorUrl(selectedCompanion, style),
        reference_strength: 0.25,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Image generation failed');

    return {
      id: `${Date.now()}-${index}-${data.seed ?? imageSeed}`,
      image_url: data.image_url,
      seed: data.seed,
      width: data.width,
      height: data.height,
      prompt: basePrompt,
    };
  }

  async function generateImagePack() {
    const basePrompt = prompt.trim() || generatePromptFromFields();
    if (!basePrompt.trim()) return;

    setError('');
    setVideoUrl(null);
    setGeneratedImages([]);
    setSelectedImageId('');
    setImageStatus(`Generating 0/${packSize}`);

    const results: GeneratedImage[] = [];
    let nextIndex = 0;
    const workerCount = Math.min(2, packSize);

    try {
      async function worker() {
        while (nextIndex < packSize) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          const image = await generateOneImage(basePrompt, currentIndex);
          results[currentIndex] = image;
          setGeneratedImages(results.filter(Boolean));
          setSelectedImageId(current => current || image.id);
          if (typeof image.seed === 'number') setLastSeed(image.seed);
          setImageStatus(`Generating ${results.filter(Boolean).length}/${packSize}`);
        }
      }

      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      setImageStatus(packSize === 1 ? 'Image ready' : `${packSize} images ready`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image generation failed');
      setImageStatus('');
    }
  }

  async function generateVideo() {
    if (!selectedImage?.image_url || !userId || !selectedCompanion) return;
    const scenePrompt = (videoPrompt || selectedImage.prompt || prompt).trim();
    if (!scenePrompt) return;

    setError('');
    setVideoUrl(null);
    setVideoStatus('Starting video');

    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          companionId: selectedCompanion.id,
          userMessage: scenePrompt,
          frameUrl: selectedImage.image_url,
          wardrobeState: 'clothed',
          conversationHistory: [
            { role: 'user', content: selectedImage.prompt },
            { role: 'assistant', content: scenePrompt },
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

  const isGeneratingImages = imageStatus.startsWith('Generating');
  const isGeneratingVideo = videoStatus === 'Starting video' || videoStatus.startsWith('Rendering');
  const canGenerateImage = !isGeneratingImages;
  const canGenerateVideo = Boolean(selectedImage?.image_url && userId && selectedCompanion && !isGeneratingVideo);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 lg:grid-cols-[460px_1fr]">
        <section className="border-b border-zinc-800/80 bg-zinc-950 px-5 py-5 lg:border-b-0 lg:border-r">
          <div className="mb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500 transition hover:text-zinc-100"
            >
              Dashboard
            </button>
            <span className="text-xs text-red-300">{selectedCompanion?.name}</span>
          </div>

          <div className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Companion</span>
              <select
                value={selectedCompanionId}
                onChange={(event) => setSelectedCompanionId(event.target.value)}
                className="h-11 w-full border border-zinc-800 bg-black px-3 text-sm outline-none focus:border-red-500"
              >
                {companions.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>

            <div className="border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-500">
              {getCompanionAnchorUrl(selectedCompanion, style) === selectedCompanion?.image_url
                ? 'Using profile image as anchor'
                : 'Using private full-body character anchor'}
            </div>

            <div className="grid grid-cols-1 gap-2 border border-zinc-800 bg-black p-3 sm:grid-cols-3">
              <label className="flex h-11 cursor-pointer items-center justify-center border border-zinc-800 px-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100">
                Upload Anchor
                <input
                  type="file"
                  accept="image/*"
                  onChange={uploadFullBodyAnchor}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={generateFullBodyAnchor}
                className="h-11 border border-zinc-800 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
              >
                Generate Anchor
              </button>
              <button
                type="button"
                disabled={!selectedImage}
                onClick={useSelectedImageAsAnchor}
                className="h-11 border border-zinc-800 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-700"
              >
                Use Selected
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500">Location</span>
                <input
                  value={guided.location}
                  onChange={(event) => updateGuided('location', event.target.value)}
                  placeholder="Luxury hotel suite"
                  className="h-11 w-full border border-zinc-800 bg-black px-3 text-sm outline-none placeholder:text-zinc-700 focus:border-red-500"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500">Action</span>
                <input
                  value={guided.action}
                  onChange={(event) => updateGuided('action', event.target.value)}
                  placeholder="Looking into camera"
                  className="h-11 w-full border border-zinc-800 bg-black px-3 text-sm outline-none placeholder:text-zinc-700 focus:border-red-500"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500">Wardrobe</span>
                <input
                  value={guided.wardrobe}
                  onChange={(event) => updateGuided('wardrobe', event.target.value)}
                  placeholder="Designer suit"
                  className="h-11 w-full border border-zinc-800 bg-black px-3 text-sm outline-none placeholder:text-zinc-700 focus:border-red-500"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500">Mood</span>
                <input
                  value={guided.mood}
                  onChange={(event) => updateGuided('mood', event.target.value)}
                  placeholder="Confident"
                  className="h-11 w-full border border-zinc-800 bg-black px-3 text-sm outline-none placeholder:text-zinc-700 focus:border-red-500"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500">Camera</span>
                <input
                  value={guided.camera}
                  onChange={(event) => updateGuided('camera', event.target.value)}
                  className="h-11 w-full border border-zinc-800 bg-black px-3 text-sm outline-none focus:border-red-500"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500">Lighting</span>
                <input
                  value={guided.lighting}
                  onChange={(event) => updateGuided('lighting', event.target.value)}
                  className="h-11 w-full border border-zinc-800 bg-black px-3 text-sm outline-none focus:border-red-500"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500">Details</span>
              <input
                value={guided.details}
                onChange={(event) => updateGuided('details', event.target.value)}
                placeholder="Mahogany desk, city lights, polished styling"
                className="h-11 w-full border border-zinc-800 bg-black px-3 text-sm outline-none placeholder:text-zinc-700 focus:border-red-500"
              />
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                  Prompt
                </label>
                <button
                  type="button"
                  onClick={generatePromptFromFields}
                  className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300 transition hover:text-red-200"
                >
                  Generate Prompt
                </button>
              </div>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={7}
                placeholder="Generated prompt appears here"
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

            <div className="grid grid-cols-4 gap-2">
              {packSizes.map(size => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPackSize(size)}
                  className={`h-11 border text-sm font-bold transition ${
                    packSize === size
                      ? 'border-red-500 bg-red-950/30 text-white'
                      : 'border-zinc-800 bg-black text-zinc-500 hover:border-zinc-600'
                  }`}
                >
                  {size}
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
              onClick={generateImagePack}
              className="h-12 w-full bg-red-600 text-sm font-bold uppercase tracking-[0.25em] text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {isGeneratingImages ? imageStatus : `Generate ${packSize === 1 ? 'Image' : 'Pack'}`}
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
              {isGeneratingVideo ? 'Rendering' : 'Generate Video'}
            </button>

            {(imageStatus || videoStatus || anchorStatus || error) && (
              <div className="min-h-10 border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-500">
                {error || videoStatus || anchorStatus || imageStatus}
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-[70vh] flex-col bg-black">
          <div className="relative flex min-h-[58vh] flex-1 items-center justify-center p-5">
            {selectedImage?.image_url ? (
              <>
                <img
                  src={selectedImage.image_url}
                  alt="Generated"
                  className="max-h-[calc(100dvh-210px)] w-full object-contain"
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
                  <span>{selectedImage.width} x {selectedImage.height}</span>
                  <span>Seed {selectedImage.seed ?? lastSeed ?? 'Random'}</span>
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-[55vh] w-full items-center justify-center border border-dashed border-zinc-800 text-center">
                <p className="max-w-xs text-sm text-zinc-600">Generated media appears here.</p>
              </div>
            )}
          </div>

          {generatedImages.length > 0 && (
            <div className="border-t border-zinc-900 bg-zinc-950 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {generatedImages.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => {
                      setSelectedImageId(image.id);
                      setVideoUrl(null);
                    }}
                    className={`group border bg-black p-1 text-left transition ${
                      selectedImage?.id === image.id ? 'border-red-500' : 'border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <img
                      src={image.image_url}
                      alt={`Generated ${index + 1}`}
                      className="aspect-[3/4] w-full object-cover"
                    />
                    <div className="flex items-center justify-between gap-2 px-1 py-2 text-[11px] text-zinc-500">
                      <span>#{index + 1}</span>
                      <span>{image.seed ?? 'Random'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
