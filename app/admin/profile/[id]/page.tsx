'use client';

import { use, useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { archetypes, type Archetype, buildArchetypePrompt, NEGATIVE_PROMPT } from '@/lib/archetypes';
import { createClient } from '@/lib/supabase';

type GalleryImage = {
  id: string; archetype_id: string; image_url: string;
  seed: number | null; style: string; prompt_used: string | null;
  is_main: boolean; sort_order: number;
};
type GalleryVideo = {
  id: string; archetype_id: string; video_url: string;
  source_image_url: string | null; prompt_used: string | null;
  is_featured: boolean; sort_order: number;
};
type GenerateStatusResponse = {
  image_url?: string;
  success?: boolean;
  seed?: number;
  status?: string;
  status_message?: string;
  error?: string;
  raw?: {
    error?: string;
    output?: {
      image?: string;
      seed?: number;
      error?: string;
    };
  };
};
type Tab = 'images' | 'videos';
type ImageStyle = 'portrait' | 'fullbody' | 'fullscreen';
type PackSize = 1 | 5 | 10;
type ReferenceBehavior = 'prompt' | 'balanced' | 'match';
type StructuredPromptFields = {
  race: string;
  gender: 'M' | 'F';
  age: string;
  wardrobe: string;
  environment: string;
  details: string;
};
type SceneSuggestion = Pick<StructuredPromptFields, 'wardrobe' | 'environment' | 'details'>;

const STYLE_OPTS: { key: ImageStyle; label: string; size: string }[] = [
  { key: 'portrait', label: 'Portrait', size: '768×1024' },
  { key: 'fullbody', label: 'Full Body', size: '832×1216' },
  { key: 'fullscreen', label: 'Full Screen', size: '768×1344' },
];
const REFERENCE_BEHAVIOR_OPTS: { key: ReferenceBehavior; label: string; denoise: number; strength: number }[] = [
  { key: 'prompt', label: 'Prompt', denoise: 0.76, strength: 0.12 },
  { key: 'balanced', label: 'Balanced', denoise: 0.70, strength: 0.18 },
  { key: 'match', label: 'Match', denoise: 0.56, strength: 0.26 },
];

const BTN_GOLD: React.CSSProperties = { padding: '8px 18px', background: 'var(--gold)', border: 'none', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--onyx)', fontWeight: 500 };
const BTN_GHOST: React.CSSProperties = { padding: '7px 14px', background: 'transparent', border: '1px solid var(--gold-dim)', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)' };
const BTN_MUTED: React.CSSProperties = { padding: '7px 14px', background: 'transparent', border: '1px solid var(--border-mid)', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ivory-muted)' };
const BTN_DANGER: React.CSSProperties = { padding: '5px 10px', background: 'transparent', border: '1px solid rgba(192,57,43,0.35)', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.12em', color: '#c0392b' };
const FIELD_LABEL: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ivory-muted)', marginBottom: '5px' };
const FIELD_INPUT: React.CSSProperties = { width: '100%', padding: '10px 11px', background: '#0e0d0c', border: '1px solid #3a332f', borderRadius: '2px', color: 'var(--ivory)', fontFamily: 'var(--font-mono)', fontSize: '12px', outline: 'none' };

const HUMAN_REALISM = 'RAW candid DSLR photo, photorealistic human, natural skin pores, realistic eyes';
const WARDROBE_IDEAS = [
  'tailored navy suit',
  'open collar black shirt',
  'cream linen shirt',
  'charcoal turtleneck and coat',
  'white oxford shirt',
  'sleek monochrome streetwear',
];
const ENVIRONMENT_IDEAS = [
  'modern office with large window light',
  'quiet hotel lounge at golden hour',
  'city street after rain',
  'minimal studio with soft side light',
  'private library with warm lamps',
  'rooftop terrace at dusk',
];
const DETAIL_IDEAS = [
  'calm confident expression',
  'direct gaze, subtle smile',
  'composed and magnetic',
  'relaxed shoulders, natural stance',
  'quiet intensity, candid moment',
  'editorial mood, authentic expression',
];

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').replace(/[.]+$/g, '').trim();
}

function limitWords(value: string, maxWords: number) {
  return value.split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ');
}

function shortComposition(style: ImageStyle) {
  if (style === 'fullbody') return 'full body in frame';
  if (style === 'fullscreen') return 'vertical full screen scene';
  return 'tight head-and-shoulders portrait, no empty headroom';
}

function formatAge(age: string) {
  const cleaned = compactText(age);
  if (!cleaned) return '';
  if (/^age\b/i.test(cleaned)) return cleaned;
  return `age ${cleaned}`;
}

function buildStructuredPreview(fields: StructuredPromptFields, style: ImageStyle, manualPrompt: string) {
  const identity = [
    compactText(fields.race),
    fields.gender === 'M' ? 'male' : 'female',
    formatAge(fields.age),
  ].filter(Boolean).join(' ');

  return limitWords([
    identity,
    compactText(fields.wardrobe),
    compactText(fields.environment),
    compactText(fields.details),
    compactText(manualPrompt),
    HUMAN_REALISM,
    shortComposition(style),
  ].filter(Boolean).join(', '), 55);
}

function suggestionIndex(seed: string, offset: number, length: number) {
  let total = offset;
  for (let i = 0; i < seed.length; i++) total += seed.charCodeAt(i) * (i + 1);
  return Math.abs(total) % length;
}

function buildSceneSuggestion(archetype: Archetype | null, id: string): SceneSuggestion {
  const seed = `${id}-${archetype?.name ?? ''}-${archetype?.style ?? ''}-${archetype?.energy ?? ''}`;

  return {
    wardrobe: WARDROBE_IDEAS[suggestionIndex(seed, 3, WARDROBE_IDEAS.length)],
    environment: ENVIRONMENT_IDEAS[suggestionIndex(seed, 11, ENVIRONMENT_IDEAS.length)],
    details: DETAIL_IDEAS[suggestionIndex(seed, 19, DETAIL_IDEAS.length)],
  };
}

function applySceneSuggestions(fields: StructuredPromptFields, suggestion: SceneSuggestion): StructuredPromptFields {
  return {
    ...fields,
    wardrobe: compactText(fields.wardrobe) || suggestion.wardrobe,
    environment: compactText(fields.environment) || suggestion.environment,
    details: compactText(fields.details) || suggestion.details,
  };
}

function inferStructuredPrompt(archetype: Archetype | null, prompt: string, gender: 'M' | 'F'): StructuredPromptFields {
  const raceMatch = prompt.match(/\b(African American|Black|Latina|Latino|Asian|South Asian|Middle Eastern|Indigenous|White|Caucasian|biracial|multiracial)\b/i);
  const ageMatch = prompt.match(/\bage\s*(\d{2})\b/i);

  return {
    race: raceMatch?.[1] ?? '',
    gender,
    age: ageMatch?.[1] ?? (archetype?.age ? String(archetype.age) : ''),
    wardrobe: '',
    environment: '',
    details: archetype ? `${archetype.style.toLowerCase()}, ${archetype.energy.toLowerCase()}` : '',
  };
}

export default function AdminProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();
  const hardcoded = archetypes.find((a) => a.id === id);

  const [archetype, setArchetype] = useState<Archetype | null>(hardcoded ?? null);
  const [tab, setTab] = useState<Tab>('images');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [videos, setVideos] = useState<GalleryVideo[]>([]);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageStyle, setImageStyle] = useState<ImageStyle>('portrait');
  const [resolution, setResolution] = useState<'standard' | 'high'>('standard');
  const [packSize, setPackSize] = useState<PackSize>(1);
  const [seed, setSeed] = useState('');
  const [genImages, setGenImages] = useState(false);
  const [useReferenceImage, setUseReferenceImage] = useState(false);
  const [referenceBehavior, setReferenceBehavior] = useState<ReferenceBehavior>('prompt');
  const [genderOverride, setGenderOverride] = useState<'M' | 'F' | null>(null);
  const [structuredPrompt, setStructuredPrompt] = useState<StructuredPromptFields>(() => inferStructuredPrompt(hardcoded ?? null, '', hardcoded?.gender ?? 'M'));
  const [structuredInitialized, setStructuredInitialized] = useState(false);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoSourceUrl, setVideoSourceUrl] = useState<string | null>(null);
  const [genVideo, setGenVideo] = useState(false);
  const [uploadingFrame, setUploadingFrame] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
  const [viewerImage, setViewerImage] = useState<GalleryImage | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        if (!hardcoded) {
          const cRes = await fetch('/api/archetypes/custom');
          const { archetypes: customs } = await cRes.json();
          const found = customs?.find((c: { id: string }) => c.id === id);
          if (found) {
            const { customRowToArchetype } = await import('@/lib/archetypes');
            setArchetype(customRowToArchetype(found));
            if (found.prompt_used) setImagePrompt(found.prompt_used);
          }
        }
        const [gRes, vRes, pRes] = await Promise.all([
          fetch(`/api/archetypes/gallery?archetype_id=${id}`).then((r) => r.json()),
          fetch(`/api/archetypes/videos?archetype_id=${id}`).then((r) => r.json()),
          fetch('/api/archetypes/prompts').then((r) => r.json()),
        ]);
        let imgs: GalleryImage[] = gRes.images ?? [];
        if (imgs.length === 0) {
          const iRes = await fetch('/api/archetypes/images');
          const { images } = await iRes.json();
          if (images?.[id]) {
            const saveRes = await fetch('/api/archetypes/gallery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archetype_id: id, image_url: images[id], is_main: true }) });
            const saveData = await saveRes.json();
            if (saveData.image) imgs = [saveData.image];
          }
        }
        setGallery(imgs);
        setVideos(vRes.videos ?? []);
        const foundArchetype = archetypes.find((a) => a.id === id);
        if (pRes.prompts?.[id]) {
          setImagePrompt(pRes.prompts[id]);
        } else if (foundArchetype) {
          setImagePrompt(buildArchetypePrompt(foundArchetype));
        }
      } catch (err) {
        console.error('Error loading admin profile data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, hardcoded]);

  // Ensure only admin users can access this page
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted) return;
      if (!user) router.push('/login');
    });
    return () => { mounted = false };
  }, [router]);

  useEffect(() => {
    if (loading || structuredInitialized) return;
    const effectiveGender = genderOverride ?? archetype?.gender ?? 'M';
    setStructuredPrompt(inferStructuredPrompt(archetype, imagePrompt, effectiveGender));
    setStructuredInitialized(true);
  }, [archetype, genderOverride, imagePrompt, loading, structuredInitialized]);

  const sceneSuggestion = buildSceneSuggestion(archetype, id);
  const promptFieldsForGeneration = applySceneSuggestions(structuredPrompt, sceneSuggestion);
  const finalPromptPreview = buildStructuredPreview(promptFieldsForGeneration, imageStyle, imagePrompt);

  function setStructuredField<K extends keyof StructuredPromptFields>(field: K, value: StructuredPromptFields[K]) {
    setStructuredPrompt((prev) => ({ ...prev, [field]: value }));
  }

  async function generateImages() {
    if (!finalPromptPreview.trim()) { setStatus('Add structured prompt details first.'); return; }
    setGenImages(true);
    const baseSeed = seed.trim() ? Number(seed) : -1;
    let done = 0;
    let lastGenerationError: string | null = null;
    const effectiveGender = promptFieldsForGeneration.gender;
    const finalPrompt = imagePrompt.trim();
    const referenceImageUrl = useReferenceImage ? gallery.find((g) => g.is_main)?.image_url ?? gallery[0]?.image_url : undefined;
    const referenceBehaviorSetting = REFERENCE_BEHAVIOR_OPTS.find((option) => option.key === referenceBehavior) ?? REFERENCE_BEHAVIOR_OPTS[0];
    for (let i = 0; i < packSize; i++) {
      try {
        const generationSeed = baseSeed >= 0 ? baseSeed + i : -1;
        setStatus(`Generating image ${i + 1} / ${packSize}${generationSeed >= 0 ? ` · seed ${generationSeed}` : ''}...`);
        // Determine optional width/height overrides based on resolution selection
        let widthOverride: number | undefined = undefined;
        let heightOverride: number | undefined = undefined;
        if (resolution === 'high') {
          // Cap high-res requests to fit within the 1,048,576 pixel limit
          if (imageStyle === 'portrait') { widthOverride = 768; heightOverride = 1024; }
          if (imageStyle === 'fullbody') { widthOverride = 832; heightOverride = 1216; }
          if (imageStyle === 'fullscreen') { widthOverride = 768; heightOverride = 1344; }
        }

        const res = await fetch('/api/generate-companion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: finalPrompt, structured_prompt: promptFieldsForGeneration, negative_prompt: NEGATIVE_PROMPT, style: imageStyle, num_inference_steps: 35, guidance_scale: 7.5, seed: generationSeed, width: widthOverride, height: heightOverride, gender: effectiveGender, reference_image_url: referenceImageUrl, reference_mode: referenceImageUrl ? 'identity' : undefined, reference_strength: referenceImageUrl ? referenceBehaviorSetting.strength : undefined, denoise_strength: referenceImageUrl ? referenceBehaviorSetting.denoise : undefined }) });
        const data = await res.json();
        const generatedPrompt = typeof data.prompt_preview === 'string' ? data.prompt_preview : finalPromptPreview;

        if (!res.ok) {
          const errorMessage = data.error || 'Image generation request failed.';
          lastGenerationError = errorMessage;
          setStatus(errorMessage);
          continue;
        }

        // If server returned image immediately (legacy/blocking), handle as before
        if (res.ok && data.image_url) {
          const saveRes = await fetch('/api/archetypes/gallery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archetype_id: id, image_url: data.image_url, seed: data.seed, style: imageStyle, prompt_used: generatedPrompt, is_main: gallery.length === 0 && i === 0 }) });
          const saved = await saveRes.json();
          if (saved.image) { setGallery((prev) => [...prev, saved.image]); done++; }
          continue;
        }

        // If accepted async, poll status endpoint
        if (res.status === 202 && data?.jobId) {
          const jobId = data.jobId as string;
          let attempts = 0;
          const maxAttempts = 120; // ~6 minutes
          let completedData: GenerateStatusResponse | null = null;
          let generationError: string | null = null;

          while (attempts < maxAttempts) {
            await new Promise((r) => setTimeout(r, 3000));
            attempts++;
            setStatus(`Waiting for job ${attempts * 3}s...`);
            try {
              const sres = await fetch(`/api/generate-companion/status/${jobId}`);
              const sdata = await sres.json().catch(() => ({})) as GenerateStatusResponse;
              if (!sres.ok) {
                generationError = sdata.error || 'Image generation failed.';
                break;
              }

              const statusError = sdata.error || sdata.raw?.output?.error || sdata.raw?.error;
              if (statusError) {
                generationError = statusError;
                break;
              }

              // If proxy returned saved image_url or raw completed data
              if (sdata.image_url || sdata.success) {
                completedData = sdata;
                break;
              }

              // Expose queue/progress messages to admin
              if (sdata.status) setStatus(`Job status: ${sdata.status}`);
              if (sdata.status_message) setStatus(sdata.status_message);
            } catch (err) {
              generationError = err instanceof Error ? err.message : 'Image generation failed.';
              break;
            }
          }

          if (!completedData) {
            const errorMessage = generationError || 'Image generation timed out.';
            lastGenerationError = errorMessage;
            setStatus(errorMessage);
            continue;
          }

          const imageUrl = completedData.image_url ?? (completedData.raw?.output?.image ? `data:image/png;base64,${completedData.raw.output.image}` : null);
          const outputSeed = completedData.seed ?? completedData.raw?.output?.seed ?? null;
          if (!imageUrl) continue;

          const saveRes = await fetch('/api/archetypes/gallery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archetype_id: id, image_url: imageUrl, seed: outputSeed, style: imageStyle, prompt_used: generatedPrompt, is_main: gallery.length === 0 && i === 0 }) });
          const saved = await saveRes.json();
          if (saved.image) { setGallery((prev) => [...prev, saved.image]); done++; }
          continue;
        }

        // Unknown response — skip
        continue;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Image generation failed.';
        lastGenerationError = errorMessage;
        setStatus(errorMessage);
      }
    }
    if (lastGenerationError && done === 0) {
      setStatus(lastGenerationError);
    } else if (lastGenerationError) {
      setStatus(`Done - ${done} of ${packSize} generated. Last error: ${lastGenerationError}`);
    } else {
      setStatus(`Done — ${done} of ${packSize} generated.`);
    }
    setGenImages(false);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setStatus('Uploading image...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const ext = file.name.split('.').pop() || 'jpg';
      const { data, error } = await supabase.storage.from('companions').upload(`${user.id}/archetype-${id}-${Date.now()}.${ext}`, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('companions').getPublicUrl(data.path);
      const saveRes = await fetch('/api/archetypes/gallery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archetype_id: id, image_url: urlData.publicUrl, is_main: gallery.length === 0, style: 'upload' }) });
      const saved = await saveRes.json();
      if (saved.image) setGallery((prev) => [...prev, saved.image]);
      setStatus('Uploaded.');
    } catch (err) { setStatus(err instanceof Error ? err.message : 'Upload failed'); }
  }

  async function setMainImage(img: GalleryImage) {
    await fetch(`/api/archetypes/gallery/${img.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_main: true, image_url: img.image_url }) });
    setGallery((prev) => prev.map((g) => ({ ...g, is_main: g.id === img.id })));
    setStatus('Main image updated.');
  }

  async function deleteImage(img: GalleryImage) {
    if (deletingImageId) return;
    if (!confirm('Delete this image?')) return;
    setDeletingImageId(img.id);
    try {
      const res = await fetch(`/api/archetypes/gallery/${img.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Delete failed');

      setGallery((prev) => {
        const next = prev.filter((g) => g.id !== img.id);
        if (img.is_main && next.length > 0) next[0] = { ...next[0], is_main: true };
        return next;
      });
      if (videoSourceUrl === img.image_url) setVideoSourceUrl(null);
      if (viewerImage?.id === img.id) {
        setViewerImageUrl(null);
        setViewerImage(null);
      }
      setStatus('Image deleted.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeletingImageId(null);
    }
  }

  async function moveImage(index: number, dir: 'up' | 'down') {
    const next = [...gallery]; const swap = dir === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    const updates = next.map((img, i) => ({ ...img, sort_order: i }));
    setGallery(updates);
    await Promise.all(updates.map((img) => fetch(`/api/archetypes/gallery/${img.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: img.sort_order }) })));
  }

  async function handleFrameUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setUploadingFrame(true); setStatus('Uploading frame...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const ext = file.name.split('.').pop() || 'jpg';
      const { data, error } = await supabase.storage.from('companions').upload(`${user.id}/frame-${id}-${Date.now()}.${ext}`, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('companions').getPublicUrl(data.path);
      setVideoSourceUrl(urlData.publicUrl);
      setStatus('Frame ready.');
    } catch (err) { setStatus(err instanceof Error ? err.message : 'Frame upload failed'); }
    setUploadingFrame(false);
  }

  const pollForVideo = useCallback(async (predictionId: string, sourceUrl: string) => {
    let attempts = 0;
    const poll = async () => {
      if (attempts >= 120) { setStatus('Video timed out.'); setGenVideo(false); return; }
      attempts++;
      setStatus(`Rendering video... (${attempts * 5}s elapsed)`);
      try {
        const res = await fetch('/api/generate-video/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ predictionId }) });
        const data = await res.json();
        if (data.video_url) {
          const proxyUrl = `/api/video-proxy?url=${encodeURIComponent(data.video_url as string)}`;
          const saveRes = await fetch('/api/archetypes/videos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archetype_id: id, video_url: proxyUrl, source_image_url: sourceUrl, prompt_used: videoPrompt, is_featured: videos.length === 0 }) });
          const saved = await saveRes.json();
          if (saved.video) setVideos((prev) => [...prev, saved.video]);
          setStatus('Video ready.'); setGenVideo(false); return;
        }
        if (data.status === 'failed') { setStatus('Video failed.'); setGenVideo(false); return; }
        pollRef.current = setTimeout(poll, 5000);
      } catch { pollRef.current = setTimeout(poll, 5000); }
    };
    pollRef.current = setTimeout(poll, 5000);
  }, [id, videoPrompt, videos.length]);

  async function generateVideo() {
    const sourceUrl = videoSourceUrl || gallery.find((g) => g.is_main)?.image_url;
    if (!sourceUrl) { setStatus('Select a source image first.'); return; }
    if (!videoPrompt.trim()) { setStatus('Add a video prompt first.'); return; }
    setGenVideo(true); setStatus('Submitting video job...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const res = await fetch('/api/generate-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, userMessage: videoPrompt, frameUrl: sourceUrl, wardrobeState: 'clothed', conversationHistory: [{ role: 'user', content: videoPrompt }] }) });
      const data = await res.json();
      if (!res.ok || !data.prediction_id) throw new Error(data.error || 'Submission failed');
      setStatus('Video submitted — polling...');
      pollForVideo(data.prediction_id, sourceUrl);
    } catch (err) { setStatus(err instanceof Error ? err.message : 'Failed'); setGenVideo(false); }
  }

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  async function deleteVideo(video: GalleryVideo) {
    if (!confirm('Delete this video?')) return;
    await fetch(`/api/archetypes/videos/${video.id}`, { method: 'DELETE' });
    setVideos((prev) => prev.filter((v) => v.id !== video.id));
    setStatus('Video deleted.');
  }

  async function setFeaturedVideo(video: GalleryVideo) {
    await fetch(`/api/archetypes/videos/${video.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_featured: true }) });
    setVideos((prev) => prev.map((v) => ({ ...v, is_featured: v.id === video.id })));
    setStatus('Featured video updated.');
  }

  async function moveVideo(index: number, dir: 'up' | 'down') {
    const next = [...videos]; const swap = dir === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    const updates = next.map((v, i) => ({ ...v, sort_order: i }));
    setVideos(updates);
    await Promise.all(updates.map((v) => fetch(`/api/archetypes/videos/${v.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: v.sort_order }) })));
  }

  if (loading) return <div style={{ minHeight: '100dvh', background: 'var(--onyx)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.3em', color: 'var(--ivory-ghost)', textTransform: 'uppercase' }}>Loading...</div></div>;
  if (!archetype) return <div style={{ minHeight: '100dvh', background: 'var(--onyx)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><button onClick={() => router.push('/admin/archetypes')} style={BTN_MUTED}>◁ Back</button></div>;

  return (
    <div style={{ minHeight: '100dvh', width: '100%', background: 'var(--onyx)', padding: '28px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '4px' }}>◈ Admin — Media Manager</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', color: 'var(--ivory)' }}>{archetype.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--gold)', border: '1px solid var(--gold-dim)', padding: '2px 8px', borderRadius: '2px' }}>{archetype.dossierId}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ivory-muted)' }}>{archetype.gender === 'M' ? '♂ Man' : '♀ Woman'}</div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ivory-muted)', marginTop: '3px' }}>{archetype.archetype}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => router.push('/admin/archetypes')} style={BTN_MUTED}>◁ Archetypes</button>
            <button onClick={() => router.push(`/dossier/${id}`)} style={BTN_MUTED}>◎ Dossier</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-dark)', marginBottom: '20px' }}>
          {(['images', 'videos'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 22px', background: 'none', border: 'none', borderBottom: tab === t ? '1px solid var(--gold)' : '1px solid transparent', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'capitalize', color: tab === t ? 'var(--gold)' : 'var(--ivory-muted)' }}>
              {t === 'images' ? `□ Images (${gallery.length})` : `▷ Videos (${videos.length})`}
            </button>
          ))}
        </div>

        {/* Status */}
        {status && <div style={{ padding: '8px 14px', background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '2px', marginBottom: '16px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ivory-muted)' }}>{status}</div>}

        {/* IMAGES */}
          {tab === 'images' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '14px' }}>◈ Gallery — {gallery.length} image{gallery.length !== 1 ? 's' : ''}</div>
              {gallery.length === 0 ? (
                <div style={{ padding: '40px', border: '1px dashed var(--border-mid)', borderRadius: '3px', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '14px', fontStyle: 'italic', color: 'var(--ivory-ghost)' }}>No images yet.</div>
              ) : (() => {
                const mainImg = gallery.find((g) => g.is_main) ?? gallery[0];
                const secondaryImgs = gallery.filter((g) => g.id !== mainImg.id);
                const mainIdx = gallery.findIndex((g) => g.id === mainImg.id);

                const ImageCard = ({ img, i, isHero }: { img: GalleryImage; i: number; isHero: boolean }) => (
                  <div style={{ background: 'var(--charcoal)', border: `1px solid ${img.is_main ? 'var(--gold)' : 'var(--border-dark)'}`, borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ position: 'relative', overflow: 'hidden', background: archetype.imageGradient, ...(isHero ? { display: 'flex', justifyContent: 'center', alignItems: 'center', maxHeight: '70vh' } : { aspectRatio: '3/4' }) }}>
                      <div style={isHero ? { maxWidth: '520px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' } : undefined}>
                        <img src={img.image_url} alt="" style={isHero ? { width: '100%', height: 'auto', maxHeight: '70vh', objectFit: 'contain', objectPosition: 'center center', display: 'block' } : { width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center center', display: 'block' }} />
                      </div>
                      {img.is_main && <div style={{ position: 'absolute', top: '8px', left: '8px', fontFamily: 'var(--font-mono)', fontSize: '7px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--onyx)', background: 'var(--gold)', padding: '3px 8px', borderRadius: '2px' }}>Main</div>}
                      {img.seed && <div style={{ position: 'absolute', bottom: '8px', left: '8px', fontFamily: 'var(--font-mono)', fontSize: '7px', color: 'var(--ivory-ghost)', background: 'rgba(0,0,0,0.75)', padding: '2px 6px', borderRadius: '2px' }}>{img.seed}</div>}
                    </div>
                    <div style={{ padding: isHero ? '10px' : '8px', display: 'flex', flexDirection: isHero ? 'row' : 'column', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', flex: isHero ? 0 : 1 }}>
                        <button onClick={() => moveImage(i, 'up')} disabled={i === 0} style={{ ...BTN_MUTED, padding: '4px 10px', opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                        <button onClick={() => moveImage(i, 'down')} disabled={i === gallery.length - 1} style={{ ...BTN_MUTED, padding: '4px 10px', opacity: i === gallery.length - 1 ? 0.3 : 1 }}>▼</button>
                      </div>
                      {!img.is_main && <button onClick={() => setMainImage(img)} style={{ ...BTN_MUTED, padding: '4px 10px', fontSize: '8px', flex: isHero ? 0 : 1, textAlign: 'center' }}>Set Main</button>}
                      <button onClick={() => { setVideoSourceUrl(img.image_url); setTab('videos'); setStatus('Source frame set.'); }} style={{ ...BTN_MUTED, padding: '4px 10px', fontSize: '8px', flex: isHero ? 0 : 1, textAlign: 'center' }}>▷ Video</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteImage(img); }}
                        disabled={deletingImageId !== null}
                        style={{ ...BTN_DANGER, padding: '4px 10px', flex: isHero ? 0 : 1, textAlign: 'center', opacity: deletingImageId === img.id ? 0.5 : 1, cursor: deletingImageId !== null ? 'not-allowed' : 'pointer' }}
                      >
                        {deletingImageId === img.id ? 'Deleting...' : '✕ Delete'}
                      </button>
                    </div>
                  </div>
                );

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Hero image — full width */}
                    <ImageCard img={mainImg} i={mainIdx} isHero={true} />

                    {/* Secondary images — medium grid */}
                    {secondaryImgs.length > 0 && (
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '10px' }}>◈ Other Images</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                          {secondaryImgs.map((img) => {
                            const origIdx = gallery.findIndex((g) => g.id === img.id);
                            return (
                              <div
                                style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--onyx)', border: '1px solid var(--border-dark)' }}
                                key={img.id}
                                onClick={() => { setViewerImageUrl(img.image_url); setViewerImage(img); }}
                                title="View image"
                              >
                                <img src={img.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
                                {img.seed && <div style={{ position: 'absolute', top: '6px', left: '6px', fontFamily: 'var(--font-mono)', fontSize: '7px', color: 'var(--ivory-ghost)', background: 'rgba(0,0,0,0.75)', padding: '2px 6px', borderRadius: '2px' }}>{img.seed}</div>}
                                <div style={{ position: 'absolute', top: '6px', right: '6px', display: 'flex', gap: '4px' }}>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); moveImage(origIdx, 'up'); }}
                                    disabled={origIdx === 0 || deletingImageId !== null}
                                    title="Move up"
                                    style={{ width: '24px', height: '24px', background: 'rgba(0,0,0,0.72)', border: '1px solid var(--border-mid)', borderRadius: '2px', color: 'var(--ivory-muted)', cursor: origIdx === 0 || deletingImageId !== null ? 'not-allowed' : 'pointer', opacity: origIdx === 0 ? 0.45 : 1 }}
                                  >
                                    ▲
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); moveImage(origIdx, 'down'); }}
                                    disabled={origIdx === gallery.length - 1 || deletingImageId !== null}
                                    title="Move down"
                                    style={{ width: '24px', height: '24px', background: 'rgba(0,0,0,0.72)', border: '1px solid var(--border-mid)', borderRadius: '2px', color: 'var(--ivory-muted)', cursor: origIdx === gallery.length - 1 || deletingImageId !== null ? 'not-allowed' : 'pointer', opacity: origIdx === gallery.length - 1 ? 0.45 : 1 }}
                                  >
                                    ▼
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); deleteImage(img); }}
                                    disabled={deletingImageId !== null}
                                    title="Delete image"
                                    style={{ width: '28px', height: '24px', background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(192,57,43,0.45)', borderRadius: '2px', color: '#c0392b', cursor: deletingImageId !== null ? 'not-allowed' : 'pointer', opacity: deletingImageId === img.id ? 0.5 : 1 }}
                                  >
                                    ✕
                                  </button>
                                </div>
                                <div style={{ position: 'absolute', left: '6px', right: '6px', bottom: '6px', display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setMainImage(img); }}
                                    disabled={deletingImageId !== null}
                                    style={{ padding: '3px 6px', background: 'rgba(0,0,0,0.72)', border: '1px solid var(--gold-dim)', borderRadius: '2px', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '7px', letterSpacing: '0.08em', cursor: deletingImageId !== null ? 'not-allowed' : 'pointer' }}
                                  >
                                    Main
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setVideoSourceUrl(img.image_url); setTab('videos'); setStatus('Source frame set.'); }}
                                    disabled={deletingImageId !== null}
                                    style={{ padding: '3px 6px', background: 'rgba(0,0,0,0.72)', border: '1px solid var(--border-mid)', borderRadius: '2px', color: 'var(--ivory-muted)', fontFamily: 'var(--font-mono)', fontSize: '7px', letterSpacing: '0.08em', cursor: deletingImageId !== null ? 'not-allowed' : 'pointer' }}
                                  >
                                    Video
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'sticky', top: '28px', maxHeight: 'calc(100vh - 56px)', overflow: 'auto', alignSelf: 'start' }}>
              <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '18px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '12px' }}>◈ Generate</div>

                {/* Gender toggle */}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '5px' }}>Gender</div>
	                <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
	                  {(['M', 'F'] as const).map((g) => {
	                    const active = structuredPrompt.gender === g;
                    return (
	                      <button
	                        key={g}
	                        onClick={() => {
	                          setGenderOverride(g);
	                          setStructuredField('gender', g);
	                        }}
	                        style={{ flex: 1, padding: '8px', border: `1px solid ${active ? 'var(--gold)' : 'var(--border-mid)'}`, background: active ? 'var(--gold-glow)' : 'transparent', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '10px', color: active ? 'var(--gold)' : 'var(--ivory-muted)', letterSpacing: '0.1em' }}
	                      >
                        {g === 'M' ? '♂ Male' : '♀ Female'}
                      </button>
                    );
	                  })}
	                </div>

	                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '6px' }}>Structured Subject</div>
	                <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.62fr', gap: '8px', marginBottom: '8px' }}>
	                  <label>
	                    <div style={FIELD_LABEL}>Race / Ethnicity</div>
	                    <input value={structuredPrompt.race} onChange={(e) => setStructuredField('race', e.target.value)} placeholder="African American" style={FIELD_INPUT} />
	                  </label>
	                  <label>
	                    <div style={FIELD_LABEL}>Age</div>
	                    <input value={structuredPrompt.age} onChange={(e) => setStructuredField('age', e.target.value)} placeholder="34" style={FIELD_INPUT} />
	                  </label>
	                </div>
	                <label style={{ display: 'block', marginBottom: '8px' }}>
	                  <div style={FIELD_LABEL}>Wardrobe</div>
		                    <input value={structuredPrompt.wardrobe} onChange={(e) => setStructuredField('wardrobe', e.target.value)} placeholder={sceneSuggestion.wardrobe} style={FIELD_INPUT} />
	                </label>
	                <label style={{ display: 'block', marginBottom: '8px' }}>
	                  <div style={FIELD_LABEL}>Environment</div>
		                  <input value={structuredPrompt.environment} onChange={(e) => setStructuredField('environment', e.target.value)} placeholder={sceneSuggestion.environment} style={FIELD_INPUT} />
	                </label>
	                <label style={{ display: 'block', marginBottom: '10px' }}>
	                  <div style={FIELD_LABEL}>Mood / Details</div>
		                  <input value={structuredPrompt.details} onChange={(e) => setStructuredField('details', e.target.value)} placeholder={sceneSuggestion.details} style={FIELD_INPUT} />
	                </label>

	                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '5px' }}>Advanced Prompt Details</div>
	                <textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} rows={5} placeholder="Optional extra details. Structured fields stay first." style={{ width: '100%', padding: '12px', background: 'var(--onyx)', border: '1px solid var(--border-mid)', borderRadius: '2px', color: 'var(--ivory)', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 1.7, resize: 'vertical', outline: 'none', marginBottom: '10px' }} />
		                <div style={{ padding: '11px 12px', background: '#0e0d0c', border: '1px solid #3a332f', borderRadius: '2px', color: 'var(--ivory)', fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: 1.6, marginBottom: '10px' }}>
		                  <div style={{ ...FIELD_LABEL, marginBottom: '5px' }}>Final Prompt Preview</div>
		                  {finalPromptPreview || 'Fill the structured fields to preview the prompt.'}
		                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: useReferenceImage ? 'var(--gold-glow)' : 'var(--onyx)', border: `1px solid ${useReferenceImage ? 'var(--gold-dim)' : 'var(--border-mid)'}`, borderRadius: '2px', cursor: gallery.length > 0 ? 'pointer' : 'not-allowed', marginBottom: '10px' }}>
                  <input
                    type="checkbox"
                    checked={useReferenceImage}
                    disabled={gallery.length === 0}
                    onChange={(e) => setUseReferenceImage(e.target.checked)}
                  />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.12em', textTransform: 'uppercase', color: useReferenceImage ? 'var(--gold)' : 'var(--ivory-muted)' }}>
                    Use current main image as identity reference
                  </span>
                </label>
                {useReferenceImage && (
                  <>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '5px' }}>Reference Behavior</div>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                      {REFERENCE_BEHAVIOR_OPTS.map((option) => (
                        <button key={option.key} onClick={() => setReferenceBehavior(option.key)} style={{ flex: 1, padding: '6px 3px', textAlign: 'center', border: `1px solid ${referenceBehavior === option.key ? 'var(--gold)' : 'var(--border-mid)'}`, background: referenceBehavior === option.key ? 'var(--gold-glow)' : 'transparent', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '7px', letterSpacing: '0.1em', textTransform: 'uppercase', color: referenceBehavior === option.key ? 'var(--gold)' : 'var(--ivory-muted)' }}>
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '5px' }}>Style</div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                  {STYLE_OPTS.map((s) => (
                    <button key={s.key} onClick={() => setImageStyle(s.key)} style={{ flex: 1, padding: '6px 3px', textAlign: 'center', border: `1px solid ${imageStyle === s.key ? 'var(--gold)' : 'var(--border-mid)'}`, background: imageStyle === s.key ? 'var(--gold-glow)' : 'transparent', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '7px', letterSpacing: '0.1em', textTransform: 'uppercase', color: imageStyle === s.key ? 'var(--gold)' : 'var(--ivory-muted)' }}>
                      <div>{s.label}</div><div style={{ opacity: 0.5, fontSize: '6px' }}>{s.size}</div>
                    </button>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '5px' }}>Resolution</div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                  {(['standard', 'high'] as const).map((r) => (
                    <button key={r} onClick={() => setResolution(r)} style={{ flex: 1, padding: '6px 3px', textAlign: 'center', border: `1px solid ${resolution === r ? 'var(--gold)' : 'var(--border-mid)'}`, background: resolution === r ? 'var(--gold-glow)' : 'transparent', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '7px', letterSpacing: '0.1em', textTransform: 'uppercase', color: resolution === r ? 'var(--gold)' : 'var(--ivory-muted)' }}>
                      {r === 'standard' ? 'Standard' : 'High'}
                    </button>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '5px' }}>Pack</div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                  {[1, 5, 10].map((p) => (
                    <button key={p} onClick={() => setPackSize(p as PackSize)} style={{ flex: 1, padding: '7px', border: `1px solid ${packSize === p ? 'var(--gold)' : 'var(--border-mid)'}`, background: packSize === p ? 'var(--gold-glow)' : 'transparent', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '11px', color: packSize === p ? 'var(--gold)' : 'var(--ivory-muted)' }}>{p}</button>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '5px' }}>Seed</div>
                <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Random" inputMode="numeric" style={{ width: '100%', padding: '8px 10px', background: 'var(--onyx)', border: '1px solid var(--border-mid)', borderRadius: '2px', color: 'var(--ivory)', fontFamily: 'var(--font-mono)', fontSize: '11px', outline: 'none', marginBottom: '12px' }} />
                <button onClick={generateImages} disabled={genImages} style={{ ...BTN_GOLD, width: '100%', justifyContent: 'center', opacity: genImages ? 0.6 : 1, cursor: genImages ? 'not-allowed' : 'pointer' }}>
                  {genImages ? '◈ Generating...' : `◆ Generate ${packSize === 1 ? 'Image' : `${packSize} Images`}`}
                </button>
              </div>
              <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '16px 18px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '10px' }}>◈ Upload</div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 14px', border: '1px solid var(--border-mid)', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ivory-muted)' }}>
                  ◆ Choose File<input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* VIDEOS */}
        {tab === 'videos' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', alignItems: 'start' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '14px' }}>▷ Videos — {videos.length} clip{videos.length !== 1 ? 's' : ''}</div>
              {videos.length === 0 ? (
                <div style={{ padding: '40px', border: '1px dashed var(--border-mid)', borderRadius: '3px', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '14px', fontStyle: 'italic', color: 'var(--ivory-ghost)' }}>No videos yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {videos.map((vid, i) => (
                    <div key={vid.id} style={{ background: 'var(--charcoal)', border: `1px solid ${vid.is_featured ? 'var(--gold)' : 'var(--border-dark)'}`, borderRadius: '3px', overflow: 'hidden', display: 'grid', gridTemplateColumns: '180px 1fr' }}>
                      <div style={{ position: 'relative', background: '#000' }}>
                        <video src={vid.video_url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} controls playsInline preload="metadata" />
                        {vid.is_featured && <div style={{ position: 'absolute', top: '6px', left: '6px', fontFamily: 'var(--font-mono)', fontSize: '7px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--onyx)', background: 'var(--gold)', padding: '2px 6px', borderRadius: '2px' }}>Featured</div>}
                      </div>
                      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {vid.prompt_used && <div style={{ fontSize: '11px', color: 'var(--ivory-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>{vid.prompt_used}</div>}
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => moveVideo(i, 'up')} disabled={i === 0} style={{ ...BTN_MUTED, padding: '4px 12px', opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                          <button onClick={() => moveVideo(i, 'down')} disabled={i === videos.length - 1} style={{ ...BTN_MUTED, padding: '4px 12px', opacity: i === videos.length - 1 ? 0.3 : 1 }}>▼</button>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 'auto' }}>
                          {!vid.is_featured && <button onClick={() => setFeaturedVideo(vid)} style={BTN_GHOST}>★ Featured</button>}
                          <button onClick={() => deleteVideo(vid)} style={BTN_DANGER}>✕ Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '18px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '12px' }}>◈ Source Frame</div>
                {videoSourceUrl && (
                  <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <img src={videoSourceUrl} alt="Source" style={{ width: '56px', height: '74px', objectFit: 'cover', objectPosition: 'center top', borderRadius: '2px', border: '1px solid var(--gold)' }} />
                    <button onClick={() => setVideoSourceUrl(null)} style={BTN_DANGER}>✕ Clear</button>
                  </div>
                )}
                {gallery.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '6px' }}>Pick from Gallery</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
                      {gallery.map((img) => (
                        <div key={img.id} onClick={() => setVideoSourceUrl(img.image_url)} style={{ aspectRatio: '3/4', overflow: 'hidden', borderRadius: '2px', cursor: 'pointer', border: `1px solid ${videoSourceUrl === img.image_url ? 'var(--gold)' : 'var(--border-mid)'}`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--onyx)' }}>
                          <img src={img.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center center' }} />
                          {img.is_main && <div style={{ position: 'absolute', bottom: '2px', left: '2px', right: '2px', fontFamily: 'var(--font-mono)', fontSize: '6px', textTransform: 'uppercase', color: 'var(--onyx)', background: 'var(--gold)', textAlign: 'center', padding: '1px', borderRadius: '1px' }}>Main</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '5px' }}>Or Upload Frame</div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', border: '1px solid var(--border-mid)', borderRadius: '2px', cursor: uploadingFrame ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: '8.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: uploadingFrame ? 'var(--ivory-ghost)' : 'var(--ivory-muted)' }}>
                  {uploadingFrame ? '◈ Uploading...' : '◆ Choose Image'}
                  <input type="file" accept="image/*" onChange={handleFrameUpload} style={{ display: 'none' }} disabled={uploadingFrame} />
                </label>
              </div>

              <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '18px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '12px' }}>▷ Generate Video</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '5px' }}>Video Prompt</div>
                <textarea value={videoPrompt} onChange={(e) => setVideoPrompt(e.target.value)} rows={6} placeholder="Slow camera push-in, steady eye contact, subtle hand movement..." style={{ width: '100%', padding: '12px', background: 'var(--onyx)', border: '1px solid var(--border-mid)', borderRadius: '2px', color: 'var(--ivory)', fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: 1.8, resize: 'vertical', outline: 'none', marginBottom: '12px' }} />
                {!videoSourceUrl && gallery.length === 0 && <div style={{ padding: '8px 10px', background: 'rgba(212,175,55,0.05)', border: '1px solid var(--gold-dim)', borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--gold)', marginBottom: '10px' }}>◈ Add an image first to use as source.</div>}
                <button onClick={generateVideo} disabled={genVideo} style={{ ...BTN_GOLD, width: '100%', justifyContent: 'center', opacity: genVideo ? 0.6 : 1, cursor: genVideo ? 'not-allowed' : 'pointer' }}>
                  {genVideo ? '▷ Generating...' : '▷ Generate Video'}
                </button>
                <div style={{ marginTop: '10px', fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--ivory-ghost)', lineHeight: 1.6 }}>Videos take 3–8 minutes and save automatically.</div>
              </div>
            </div>
          </div>
        )}
        {viewerImageUrl && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }} onClick={() => { setViewerImageUrl(null); setViewerImage(null); }}>
            <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '92%', maxHeight: '92%', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
              <img src={viewerImageUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '4px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { if (viewerImage) { setMainImage(viewerImage); } setViewerImageUrl(null); setViewerImage(null); }} style={{ ...BTN_GOLD }}>Set Main</button>
                {viewerImage && (
                  <button
                    onClick={() => deleteImage(viewerImage)}
                    disabled={deletingImageId !== null}
                    style={{ ...BTN_DANGER, opacity: deletingImageId === viewerImage.id ? 0.5 : 1, cursor: deletingImageId !== null ? 'not-allowed' : 'pointer' }}
                  >
                    {deletingImageId === viewerImage.id ? 'Deleting...' : '✕ Delete'}
                  </button>
                )}
                <button onClick={() => { setViewerImageUrl(null); setViewerImage(null); }} style={{ ...BTN_MUTED }}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
