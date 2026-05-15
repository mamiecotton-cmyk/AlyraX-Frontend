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
type Tab = 'images' | 'videos';
type ImageStyle = 'portrait' | 'fullbody' | 'fullscreen';
type PackSize = 1 | 5 | 10;

const STYLE_OPTS: { key: ImageStyle; label: string; size: string }[] = [
  { key: 'portrait', label: 'Portrait', size: '768×1024' },
  { key: 'fullbody', label: 'Full Body', size: '832×1216' },
  { key: 'fullscreen', label: 'Full Screen', size: '768×1344' },
];

const BTN_GOLD: React.CSSProperties = { padding: '8px 18px', background: 'var(--gold)', border: 'none', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--onyx)', fontWeight: 500 };
const BTN_GHOST: React.CSSProperties = { padding: '7px 14px', background: 'transparent', border: '1px solid var(--gold-dim)', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)' };
const BTN_MUTED: React.CSSProperties = { padding: '7px 14px', background: 'transparent', border: '1px solid var(--border-mid)', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ivory-muted)' };
const BTN_DANGER: React.CSSProperties = { padding: '5px 10px', background: 'transparent', border: '1px solid rgba(192,57,43,0.35)', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.12em', color: '#c0392b' };

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
  const [packSize, setPackSize] = useState<PackSize>(1);
  const [seed, setSeed] = useState('');
  const [genImages, setGenImages] = useState(false);
  const [genderOverride, setGenderOverride] = useState<'M' | 'F' | null>(null);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoSourceUrl, setVideoSourceUrl] = useState<string | null>(null);
  const [genVideo, setGenVideo] = useState(false);
  const [uploadingFrame, setUploadingFrame] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function load() {
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
      // Always rebuild prompt from lib so gender is always correct
      // Only fall back to saved prompt if archetype isn't found
      const foundArchetype = archetypes.find((a) => a.id === id);
      if (foundArchetype) {
        setImagePrompt(buildArchetypePrompt(foundArchetype));
      } else if (pRes.prompts?.[id]) {
        setImagePrompt(pRes.prompts[id]);
      }
      setLoading(false);
    }
    load();
  }, [id, hardcoded]);

  async function generateImages() {
    if (!imagePrompt.trim()) { setStatus('Add a prompt first.'); return; }
    setGenImages(true);
    const baseSeed = seed.trim() ? Number(seed) : -1;
    let done = 0;
    // Build final prompt using gender override if set
    const effectiveGender = genderOverride ?? archetype?.gender ?? 'M';
    const foundArch = archetypes.find((a) => a.id === id);
    const finalPrompt = foundArch ? buildArchetypePrompt(foundArch, effectiveGender) : imagePrompt;
    for (let i = 0; i < packSize; i++) {
      try {
        setStatus(`Generating image ${i + 1} / ${packSize}...`);
        const res = await fetch('/api/generate-companion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: finalPrompt, negative_prompt: NEGATIVE_PROMPT, style: imageStyle, num_inference_steps: 35, guidance_scale: 7.5, seed: baseSeed >= 0 ? baseSeed + i : -1 }) });
        const data = await res.json();
        if (!res.ok || !data.image_url) continue;
        const saveRes = await fetch('/api/archetypes/gallery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archetype_id: id, image_url: data.image_url, seed: data.seed, style: imageStyle, prompt_used: imagePrompt, is_main: gallery.length === 0 && i === 0 }) });
        const saved = await saveRes.json();
        if (saved.image) { setGallery((prev) => [...prev, saved.image]); done++; }
      } catch { /* continue */ }
    }
    setStatus(`Done — ${done} of ${packSize} generated.`);
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
    if (!confirm('Delete this image?')) return;
    await fetch(`/api/archetypes/gallery/${img.id}`, { method: 'DELETE' });
    setGallery((prev) => { const next = prev.filter((g) => g.id !== img.id); if (img.is_main && next.length > 0) next[0] = { ...next[0], is_main: true }; return next; });
    setStatus('Image deleted.');
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>
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
                    <div style={{ position: 'relative', overflow: 'hidden', background: archetype.imageGradient, ...(isHero ? { maxHeight: '520px' } : { aspectRatio: '3/4' }) }}>
                      <img src={img.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: isHero ? 'contain' : 'cover', objectPosition: 'center top', display: 'block', background: archetype.imageGradient }} />
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
                      <button onClick={() => deleteImage(img)} style={{ ...BTN_DANGER, padding: '4px 10px', flex: isHero ? 0 : 1, textAlign: 'center' }}>✕ Delete</button>
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
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                          {secondaryImgs.map((img) => {
                            const origIdx = gallery.findIndex((g) => g.id === img.id);
                            return (
                              <div style={{ maxHeight: '180px', overflow: 'hidden', borderRadius: '3px' }} key={img.id}>
                                <ImageCard img={img} i={origIdx} isHero={false} />
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '18px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '12px' }}>◈ Generate</div>

                {/* Gender toggle */}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '5px' }}>Gender</div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                  {(['M', 'F'] as const).map((g) => {
                    const active = (genderOverride ?? archetype?.gender) === g;
                    return (
                      <button
                        key={g}
                        onClick={() => {
                          setGenderOverride(g);
                          const foundArch = archetypes.find((a) => a.id === id);
                          if (foundArch) setImagePrompt(buildArchetypePrompt(foundArch, g));
                        }}
                        style={{ flex: 1, padding: '8px', border: `1px solid ${active ? 'var(--gold)' : 'var(--border-mid)'}`, background: active ? 'var(--gold-glow)' : 'transparent', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '10px', color: active ? 'var(--gold)' : 'var(--ivory-muted)', letterSpacing: '0.1em' }}
                      >
                        {g === 'M' ? '♂ Male' : '♀ Female'}
                      </button>
                    );
                  })}
                </div>

                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '5px' }}>Prompt</div>
                <textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} rows={5} placeholder="Describe appearance, setting, mood..." style={{ width: '100%', padding: '10px', background: 'var(--onyx)', border: '1px solid var(--border-mid)', borderRadius: '2px', color: 'var(--ivory)', fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: 1.6, resize: 'vertical', outline: 'none', marginBottom: '10px' }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginBottom: '5px' }}>Style</div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                  {STYLE_OPTS.map((s) => (
                    <button key={s.key} onClick={() => setImageStyle(s.key)} style={{ flex: 1, padding: '6px 3px', textAlign: 'center', border: `1px solid ${imageStyle === s.key ? 'var(--gold)' : 'var(--border-mid)'}`, background: imageStyle === s.key ? 'var(--gold-glow)' : 'transparent', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '7px', letterSpacing: '0.1em', textTransform: 'uppercase', color: imageStyle === s.key ? 'var(--gold)' : 'var(--ivory-muted)' }}>
                      <div>{s.label}</div><div style={{ opacity: 0.5, fontSize: '6px' }}>{s.size}</div>
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
                        <div key={img.id} onClick={() => setVideoSourceUrl(img.image_url)} style={{ aspectRatio: '3/4', overflow: 'hidden', borderRadius: '2px', cursor: 'pointer', border: `1px solid ${videoSourceUrl === img.image_url ? 'var(--gold)' : 'var(--border-mid)'}`, position: 'relative' }}>
                          <img src={img.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
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
                <textarea value={videoPrompt} onChange={(e) => setVideoPrompt(e.target.value)} rows={4} placeholder="Slow camera push-in, steady eye contact, subtle hand movement..." style={{ width: '100%', padding: '10px', background: 'var(--onyx)', border: '1px solid var(--border-mid)', borderRadius: '2px', color: 'var(--ivory)', fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: 1.6, resize: 'vertical', outline: 'none', marginBottom: '12px' }} />
                {!videoSourceUrl && gallery.length === 0 && <div style={{ padding: '8px 10px', background: 'rgba(212,175,55,0.05)', border: '1px solid var(--gold-dim)', borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--gold)', marginBottom: '10px' }}>◈ Add an image first to use as source.</div>}
                <button onClick={generateVideo} disabled={genVideo} style={{ ...BTN_GOLD, width: '100%', justifyContent: 'center', opacity: genVideo ? 0.6 : 1, cursor: genVideo ? 'not-allowed' : 'pointer' }}>
                  {genVideo ? '▷ Generating...' : '▷ Generate Video'}
                </button>
                <div style={{ marginTop: '10px', fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--ivory-ghost)', lineHeight: 1.6 }}>Videos take 3–8 minutes and save automatically.</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}