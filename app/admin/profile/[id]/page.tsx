"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { archetypes, type Archetype } from '@/lib/archetypes';

export default function ProfileEditPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const id = params?.id as string | undefined;

  const [archetype, setArchetype] = useState<Archetype | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [images, setImages] = useState<Array<any>>([]);
  const [prompt, setPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const a = archetypes.find((x) => x.id === id) || null;
    setArchetype(a);

    // load existing images and saved prompt
    fetch(`/api/archetypes/images/list?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then(({ images: list }) => {
        setImages(list || []);
        setImageUrl((list && list[0]?.image_url) || null);
      })
      .catch(() => {});

    fetch('/api/archetypes/prompts')
      .then((r) => r.json())
      .then(({ prompts }) => setPrompt(prompts?.[id] || ''))
      .catch(() => {});
  }, [id]);

  // Helpers for image upload/reorder
  async function uploadFile(file: File) {
    if (!file || !id) return;
    try {
      const fileName = `${id}/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage.from('companions').upload(fileName, file, { contentType: file.type || 'image/png', upsert: true });
      if (error) throw error;
      const { data: urlData } = await supabase.storage.from('companions').getPublicUrl(data.path);
      const publicUrl = urlData.publicUrl;

      // Persist record
      await fetch('/api/archetypes/images/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetype_id: id, image_url: publicUrl }),
      });

      setImages((prev) => [...prev, { image_url: publicUrl }]);
      setMessage('Image uploaded');
    } catch (err) {
      console.error('Upload failed', err);
      setMessage('Upload failed');
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) uploadFile(f);
  }

  async function setAsMain(imageUrlToSet: string) {
    if (!id) return;
    setSaving(true);
    try {
      await fetch('/api/archetypes/images/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetype_id: id, image_url: imageUrlToSet }),
      });
      setImageUrl(imageUrlToSet);
      setMessage('Main image updated');
    } catch (err) {
      setMessage('Update failed');
    } finally {
      setSaving(false);
    }
  }

  function moveImage(index: number, dir: -1 | 1) {
    setImages((prev) => {
      const arr = [...prev];
      const to = index + dir;
      if (to < 0 || to >= arr.length) return arr;
      const tmp = arr[to];
      arr[to] = arr[index];
      arr[index] = tmp;
      return arr;
    });
  }

  async function saveOrder() {
    if (!id) return;
    const ordering = images.map((it) => it.image_url);
    try {
      await fetch('/api/archetypes/images/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetype_id: id, order: ordering }),
      });
      setMessage('Order saved');
    } catch (err) {
      setMessage('Order save failed');
    }
  }

  // Drag & drop handlers
  function onDragStart(e: React.DragEvent, idx: number) {
    e.dataTransfer.setData('text/plain', String(idx));
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function onDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (isNaN(from)) return;
    setImages((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(idx, 0, item);
      return arr;
    });
  }

  async function savePrompt() {
    if (!id) return;
    setSaving(true);
    try {
      await fetch('/api/archetypes/images/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetype_id: id, image_url: imageUrl || '', prompt_used: prompt }),
      });
      setMessage('Saved');
    } catch (e) {
      setMessage('Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function generateVideo() {
    if (!id) return;
    setGenerating(true);
    setMessage(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      const body = {
        userId,
        companionId: undefined,
        userMessage: prompt || (archetype?.bio ?? ''),
        conversationHistory: [],
        frameUrl: imageUrl || undefined,
        wardrobeState: 'clothed',
      };

      const res = await fetch('/api/generate-video', { method: 'POST', body: JSON.stringify(body) });
      const json = await res.json();
      if (json?.prediction_id) {
        setMessage(`Video queued (${json.prediction_id})`);
      } else {
        setMessage(json?.error || 'Video request failed');
      }
    } catch (e) {
      setMessage('Video request failed');
    } finally {
      setGenerating(false);
    }
  }

  if (!id) return <div style={{ padding: 24 }}>Missing profile id</div>;

  return (
    <div style={{ padding: 24, maxWidth: 880 }}>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ width: 320 }}>
          <div style={{ aspectRatio: '3/4', background: '#111', borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={archetype?.name || 'image'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ padding: 16, color: '#888' }}>No main image</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
            <label style={{ fontSize: 12, color: '#aaa' }}>Gallery</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {images.length === 0 && <div style={{ color: '#666' }}>No images</div>}
              {images.map((it, idx) => (
                <div
                  key={it.id || it.image_url}
                  draggable
                  onDragStart={(e) => onDragStart(e, idx)}
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, idx)}
                  style={{ width: 72, height: 96, position: 'relative', border: imageUrl === it.image_url ? '2px solid var(--gold)' : '1px solid #222', cursor: 'grab' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.image_url} alt={`img-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', bottom: 2, left: 2, right: 2, display: 'flex', gap: 4 }}>
                    <button onClick={() => setAsMain(it.image_url)} style={{ fontSize: 10, padding: '2px 4px' }}>Set Main</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 8 }}>
              <input type="file" accept="image/*" onChange={onFileChange} />
              <button onClick={saveOrder} style={{ marginLeft: 8 }}>Save Order</button>
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', marginBottom: 8 }}>{archetype?.name || 'Archetype'}</div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#aaa', marginBottom: 6 }}>Prompt</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} style={{ width: '100%' }} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={savePrompt} disabled={saving} style={{ padding: '8px 12px' }}>{saving ? 'Saving…' : 'Save Prompt'}</button>
            <button onClick={generateVideo} disabled={generating} style={{ padding: '8px 12px' }}>{generating ? 'Generating…' : 'Generate Video'}</button>
            <button onClick={() => router.back()} style={{ padding: '8px 12px' }}>Back</button>
          </div>

          {message && <div style={{ marginTop: 12 }}>{message}</div>}
        </div>
      </div>
    </div>
  );
}
