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
  const [prompt, setPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const a = archetypes.find((x) => x.id === id) || null;
    setArchetype(a);

    // load existing image and saved prompt
    fetch('/api/archetypes/images')
      .then((r) => r.json())
      .then(({ images }) => setImageUrl(images?.[id] || null))
      .catch(() => {});

    fetch('/api/archetypes/prompts')
      .then((r) => r.json())
      .then(({ prompts }) => setPrompt(prompts?.[id] || ''))
      .catch(() => {});
  }, [id]);

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
          <div style={{ aspectRatio: '3/4', background: '#111', borderRadius: 6, overflow: 'hidden' }}>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={archetype?.name || 'image'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ padding: 16, color: '#888' }}>No image</div>
            )}
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
