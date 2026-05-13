'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type ImageStyle = 'portrait' | 'fullbody' | 'fullscreen';
type PackSize = 1 | 5 | 10 | 20 | 30;

type Companion = {
  id: string;
  name: string;
  image_url: string;
  prompt_used?: string | null;
};

type CompanionMetadata = {
  prompt?: string;
  portraitAnchorUrl?: string;
  fullBodyAnchorUrl?: string;
  nudeAnchorUrl?: string;
  bodyReferenceUrl?: string;
  generation_seed?: number;
};

type GeneratedImage = {
  id: string;
  image_url: string;
  seed?: number;
  width?: number;
  height?: number;
  prompt: string;
};

type ImageResult = GeneratedImage | undefined;

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
  { key: 'portrait', label: 'Portrait', size: '768 x 1024' },
  { key: 'fullbody', label: 'Full Body', size: '832 x 1216' },
  { key: 'fullscreen', label: 'Full Screen', size: '768 x 1344' },
];

const packSizes: PackSize[] = [1, 5, 10, 20, 30];

const initialGuidedPrompt: GuidedPrompt = {
  location: '',
  action: '',
  wardrobe: '',
  mood: '',
  camera: 'editorial photorealism, natural proportions, premium camera detail',
  lighting: 'soft cinematic key light, realistic skin texture, coherent shadows',
  details: '',
};

function normalizeWardrobe(wardrobe: string) {
  const normalized = wardrobe.trim().toLowerCase();
  if (!normalized || ['none', 'nude', 'naked', 'no clothing', 'no clothes'].includes(normalized)) {
    return 'nude';
  }

  return wardrobe.trim();
}

function getPoseInstruction(style: ImageStyle) {
  const shared = [
    'Pose must be simple, readable, and physically possible.',
    'Face, chest, shoulders, pelvis, knees, and toes should face the same general direction unless a mild three-quarter turn is requested.',
    'Shoulders must be correctly attached to the torso, level with the collarbones, and never rotated backward.',
    'Torso and hips must align naturally; no impossible spinal twist, no backward shoulders, no reversed elbows or knees.',
    'Arms stay visible at the sides or naturally in front of the body; do not hide arms behind the back.',
  ];

  if (style === 'portrait') {
    return [
      ...shared,
      'Use a relaxed front-facing or slight three-quarter portrait pose with natural shoulders.',
    ].join(' ');
  }

  return [
    ...shared,
    'Use a stable front-facing or slight three-quarter standing pose.',
    'Both legs must connect naturally to the hips; both feet should point forward or slightly outward and rest on the ground.',
    'If the requested action is complex, simplify it into the nearest natural human pose.',
  ].join(' ');
}

function buildPrompt(guided: GuidedPrompt, style: ImageStyle) {
  const wardrobe = normalizeWardrobe(guided.wardrobe);
  const nudeInstruction = wardrobe === 'nude'
    ? 'Treat nude as a non-sexual editorial figure reference with neutral posture and clear anatomy.'
    : '';

  return [
    'Use the anchored reference image as the only source of truth for the subject identity.',
    guided.action && `Required action or pose: ${guided.action}`,
    guided.location && `Location: ${guided.location}`,
    `Wardrobe: ${wardrobe}`,
    guided.mood && `Expression and mood: ${guided.mood}`,
    guided.camera && `Camera style: ${guided.camera}`,
    guided.lighting && `Lighting: ${guided.lighting}`,
    guided.details && `Scene details: ${guided.details}`,
    getPoseInstruction(style),
    'Photorealistic human anatomy with natural proportions.',
    'Arms, hands, legs, ankles, and feet must be physically plausible and oriented correctly.',
    'No reversed limbs, no twisted joints, no extra limbs, no missing limbs.',
    'Hands have five fingers per hand; visible feet are grounded with natural toes.',
    nudeInstruction,
    'Subject remains fully coherent and uncropped for the requested framing.',
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
  const portraitAnchor = metadata.portraitAnchorUrl || companion.image_url;
  const fullBodyAnchor = metadata.fullBodyAnchorUrl || metadata.nudeAnchorUrl || metadata.bodyReferenceUrl;

  if (style === 'fullbody' || style === 'fullscreen') {
    return fullBodyAnchor || companion.image_url;
  }

  return portraitAnchor;
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
  const [steps, setSteps] = useState(28);
  const [guidance, setGuidance] = useState(7.0);
  const [seed, setSeed] = useState('');
  const [promptEditedManually, setPromptEditedManually] = useState(false);
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
    const nextPrompt = buildPrompt(guided, style);
    setPrompt(nextPrompt);
    setPromptEditedManually(false);
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

  function updateLocalPortraitAnchor(anchorUrl: string) {
    if (!selectedCompanion) return;
    const metadata = parseCompanionMetadata(selectedCompanion.prompt_used);
    const nextPromptUsed = JSON.stringify({
      ...metadata,
      portraitAnchorUrl: anchorUrl,
    });

    setCompanions(current => current.map(item => (
      item.id === selectedCompanion.id
        ? { ...item, prompt_used: nextPromptUsed }
        : item
    )));
  }

  async function saveCompanionAnchor(anchorUrl: string, anchorType: 'portrait' | 'fullBody') {
    if (!selectedCompanion) return;

    const response = await fetch('/api/companion/anchor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companionId: selectedCompanion.id,
        anchorType,
        anchorUrl,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Anchor save failed');

    if (anchorType === 'portrait') {
      updateLocalPortraitAnchor(anchorUrl);
    } else {
      updateLocalCompanionAnchor(anchorUrl);
    }
  }

  async function createFullBodyAnchor() {
    if (!selectedCompanion) return undefined;

    setAnchorStatus('Preparing character anchor');

    const response = await fetch('/api/generate-companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: [
          'Use the anchored reference image as the only source of truth for the subject identity.',
          'Full-body character anchor, nude, non-sexual editorial figure reference, neutral standing pose, front-facing or mild three-quarter view.',
          'Shoulders level with the collarbones, chest and pelvis aligned, torso and hips facing the same direction, arms relaxed slightly away from body.',
          'Plain studio background, head-to-toe visible, both feet visible and grounded, natural body proportions, physically plausible posture.',
          'No backward shoulders, no impossible spinal twist, no reversed limbs, no twisted joints, no extra limbs, no missing limbs, natural hands and natural feet.',
        ].join(', '),
        style: 'fullbody',
        num_inference_steps: Math.max(steps, 28),
        guidance_scale: 7.0,
        seed: -1,
        companionId: selectedCompanion.id,
        reference_image_url: selectedCompanion.image_url,
        reference_strength: 0.35,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Anchor generation failed');

    await saveCompanionAnchor(data.image_url, 'fullBody');
    setAnchorStatus('Character anchor ready');
    return data.image_url as string;
  }

  async function getReferenceImageForPack() {
    if (!selectedCompanion) return undefined;
    const metadata = parseCompanionMetadata(selectedCompanion.prompt_used);

    if (style === 'portrait') {
      const portraitAnchor = metadata.portraitAnchorUrl || selectedCompanion.image_url;
      if (!metadata.portraitAnchorUrl && selectedCompanion.image_url) {
        await saveCompanionAnchor(selectedCompanion.image_url, 'portrait');
      }
      return portraitAnchor;
    }

    const fullBodyAnchor = metadata.fullBodyAnchorUrl || metadata.nudeAnchorUrl || metadata.bodyReferenceUrl;
    if (fullBodyAnchor) return fullBodyAnchor;

    return createFullBodyAnchor();
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

  async function generateOneImage(basePrompt: string, index: number, referenceImageUrl?: string): Promise<GeneratedImage> {
    const baseSeed = seed.trim() ? Number(seed) : -1;
    const imageSeed = baseSeed >= 0 ? baseSeed + index : -1;

    const response = await fetch('/api/generate-companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: basePrompt,
        style,
        num_inference_steps: Math.max(18, Math.min(40, steps)),
        guidance_scale: Math.max(4.0, Math.min(9.0, guidance)),
        seed: imageSeed,
        companionId: selectedCompanion?.id,
        reference_image_url: referenceImageUrl,
        reference_strength: selectedCompanion ? 0.35 : 0.25,
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
    const fieldPrompt = buildPrompt(guided, style);
    const basePrompt = promptEditedManually && prompt.trim() ? prompt.trim() : fieldPrompt;
    if (!basePrompt.trim()) return;
    if (!promptEditedManually) setPrompt(fieldPrompt);

    setError('');
    setVideoUrl(null);
    setGeneratedImages([]);
    setSelectedImageId('');
    setImageStatus(`Generating 0/${packSize}`);

    const results: ImageResult[] = Array.from({ length: packSize });
    const failedIndexes: number[] = [];

    try {
      const referenceImageUrl = await getReferenceImageForPack();

      for (let index = 0; index < packSize; index += 1) {
        let image: GeneratedImage | undefined;

        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            setImageStatus(`Generating ${results.filter(Boolean).length}/${packSize} · image ${index + 1}`);
            image = await generateOneImage(basePrompt, index, referenceImageUrl);
            break;
          } catch (err) {
            if (attempt === 2) {
              console.error(`Image ${index + 1} failed after retry`, err);
              failedIndexes.push(index + 1);
            }
          }
        }

        if (image) {
          results[index] = image;
          const completedImages = results.filter((item): item is GeneratedImage => Boolean(item));
          setGeneratedImages(completedImages);
          setSelectedImageId(current => current || image.id);
          if (typeof image.seed === 'number') setLastSeed(image.seed);
          setImageStatus(`Generating ${completedImages.length}/${packSize}`);
        }
      }

      setAnchorStatus('');
      const completedImages = results.filter(Boolean).length;
      setImageStatus(packSize === 1 ? 'Image ready' : `${completedImages}/${packSize} images ready`);
      if (failedIndexes.length > 0) {
        setError(`Generated ${completedImages}/${packSize}. Failed images: ${failedIndexes.join(', ')}.`);
      }
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
              {style === 'portrait'
                ? 'Using portrait character anchor'
                : getCompanionAnchorUrl(selectedCompanion, style) === selectedCompanion?.image_url
                  ? 'Preparing full-body character anchor when needed'
                  : 'Using private full-body character anchor'}
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
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-zinc-500">Wardrobe Only</span>
                <input
                  value={guided.wardrobe}
                  onChange={(event) => updateGuided('wardrobe', event.target.value)}
                  placeholder="Designer suit, lingerie, no clothing"
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
                onChange={(event) => {
                  setPrompt(event.target.value);
                  setPromptEditedManually(true);
                }}
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
                  min={18}
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
                  min={4}
                  max={9}
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
