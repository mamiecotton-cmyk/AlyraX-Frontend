'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────

type GeneratedImage = {
  id: string;
  url: string;
  prompt: string;
  selected: boolean;
};

type PromptCategory = 'portrait' | 'clothed' | 'explicit';

type CharacterPrompts = {
  portrait: string[];
  clothed: string[];
  explicit: string[];
};

// ─── Character-specific prompt sets ────────────────────────────────────────

const CHARACTER_PROMPTS: Record<string, CharacterPrompts> = {
  soleil: {
    portrait: [
      'close portrait, honey golden blonde braided hair, vivid green eyes, deep ebony skin, high cheekbones, full lips, direct gaze, soft golden hour light',
      'editorial headshot, honey blonde waves framing face, striking green eyes, blue-black ebony skin luminous sheen, elegant long neck, mysterious expression',
      'close up face, golden blonde braids pulled back, intense green eyes, deep ebony complexion, model bone structure, soft rim light from behind',
      'beauty shot, honey golden hair loose waves, vivid green eyes catching light, deep ebony skin, full lips slightly parted, warm amber tones',
    ],
    clothed: [
      'full body, honey golden blonde braids, vivid green eyes, deep ebony skin, high fashion editorial outfit, standing LA rooftop golden hour, slim modelesque figure head to toe',
      'full body standing, golden blonde waves, green eyes, ebony blue-black skin, sleek designer dress gold accents, confident pose, city backdrop dusk',
      'full body, blonde braids over shoulder, green eyes, deep ebony skin, fitted fashion look, hands on hips, neutral studio background head to toe visible',
      'full body, honey blonde hair, striking green eyes, ebony skin luminous, casual chic outfit, natural light, standing relaxed full figure visible feet to head',
    ],
    explicit: [
      'full body nude, honey golden blonde braids, vivid green eyes, deep ebony skin blue-black undertones, slim modelesque figure, anatomically correct, standing natural light',
      'full body nude standing, golden blonde waves, green eyes, deep ebony skin, tall slim figure, elegant posture, soft studio light, head to toe visible',
      'nude full body, honey blonde hair, striking green eyes, ebony skin luminous sheen, natural pose, warm light, anatomically correct proportions, full figure',
      'explicit full body, golden braids, vivid green eyes, deep ebony blue-black skin, slim model body, sensual natural pose, soft golden light, head to toe in frame',
      'nude standing full body, honey blonde hair, green eyes, ebony skin, lean elegant figure, confident natural stance, diffused light, anatomically correct',
    ],
  },
  zara: {
    portrait: [
      'close portrait, long sleek honey blonde hair straight past shoulders, heavy freckles across cheeks and nose, light honey caramel skin, warm brown eyes, direct gaze',
      'beauty headshot, sleek straight blonde hair, dense freckles cheeks and nose, caramel skin tone, warm brown eyes, confident expression, soft light',
      'close up face, long honey blonde straight hair framing face, heavy freckle pattern cheeks nose, light caramel complexion, warm eyes, editorial mood',
      'portrait, sleek blonde hair pulled back, heavy freckles, honey caramel skin, brown eyes catching light, magnetic unbothered expression',
    ],
    clothed: [
      'full body, long sleek honey blonde hair, heavy freckles caramel skin, cream fitted outfit, gold jewelry, curvy hourglass figure, Houston apartment golden light, head to toe',
      'full body standing, straight blonde hair, freckled caramel skin, all-cream look nails done, confident stance, luxury interior, full figure head to toe visible',
      'full body, honey blonde hair, heavy freckles, caramel skin, fitted monochrome look, gold accessories, relaxed pose, neutral background, feet to head in frame',
      'full body, sleek blonde hair, freckled face caramel tone, stylish casual outfit, hands on hips, natural light, full figure visible head to toe',
    ],
    explicit: [
      'full body nude, long sleek honey blonde hair, heavy freckles cheeks and nose, light caramel skin, curvy hourglass figure, anatomically correct, standing natural light',
      'nude full body, straight blonde hair, dense freckles caramel complexion, curvaceous figure, confident natural pose, soft warm light, head to toe visible',
      'explicit full body, honey blonde straight hair, heavy freckle pattern, caramel skin tone, curvy body, sensual natural stance, golden light, anatomically correct',
      'nude standing, sleek blonde hair, heavy freckles, honey caramel skin, full hourglass figure, natural pose, diffused studio light, full body in frame',
      'full body nude, long blonde hair, freckled face and shoulders caramel tone, curvy proportions, relaxed confident pose, warm light, anatomically correct head to toe',
    ],
  },
  nia: {
    portrait: [
      'close portrait, long dark wavy locs past shoulders, rich warm brown skin, soft warm brown eyes, natural earthy presence, gentle direct gaze, soft window light',
      'beauty headshot, long dark wavy locs framing face, rich brown complexion, warm brown eyes, serene expression, natural warm tones',
      'close up face, dark wavy locs, rich brown skin, warm eyes, natural makeup look, calm grounded expression, golden side light',
      'portrait, dark wavy locs pulled over shoulder, warm brown skin, soft brown eyes, peaceful presence, soft natural light',
    ],
    clothed: [
      'full body, long dark wavy locs, rich brown skin, warm brown eyes, earthy linen outfit, natural setting warm light, full figure head to toe visible',
      'full body standing, dark wavy locs, rich brown complexion, earthy tones clothing, relaxed natural pose, outdoor golden light, feet to head in frame',
      'full body, dark locs past shoulders, brown skin, warm eyes, flowing natural outfit, herbs and garden setting, full figure visible',
      'full body, long dark wavy locs, rich warm brown skin, casual earthy look, confident gentle stance, soft diffused light, full body head to toe',
    ],
    explicit: [
      'full body nude, long dark wavy locs past shoulders, rich warm brown skin, warm brown eyes, natural figure, anatomically correct, soft golden light, standing',
      'nude full body, dark wavy locs, rich brown complexion, natural body, relaxed confident pose, warm studio light, head to toe visible',
      'explicit full body, dark wavy locs, rich brown skin, warm natural figure, sensual grounded pose, soft amber light, anatomically correct proportions',
      'nude standing full body, long dark locs, warm brown skin, natural figure, serene confident stance, diffused light, full body in frame head to toe',
      'full body nude, dark wavy locs, rich brown skin tone, natural proportions, relaxed pose, warm golden light, anatomically correct, full figure visible',
    ],
  },
  jerome: {
    portrait: [
      'close portrait, honey-tipped dreadlocks sometimes pulled back, thin mustache light soul patch, medium brown skin, gold hoop earrings, confident reflective expression',
      'headshot, honey-tipped locs, thin mustache and soul patch, medium brown complexion, mature confidence, warm ambient light, direct gaze',
      'close up face, honey-tipped dreads, thin mustache soul patch, medium brown skin, ambitious expression, editorial light',
      'portrait, honey-tipped dreadlocks, light facial hair mustache soul patch, medium brown skin tone, gold earrings, composed expression soft light',
    ],
    clothed: [
      'full body, honey-tipped dreadlocs, thin mustache soul patch, medium brown skin, tribal blackwork sleeve tattoo right arm only, tailored charcoal suit open collar, Detroit office, full figure head to toe',
      'full body standing, honey-tipped locs, mustache soul patch, medium brown skin, right arm tribal tattoo only, fitted casual outfit, confident stance, head to toe visible',
      'full body, honey-tipped dreads, thin mustache, medium brown skin, tribal sleeve right arm clean left arm, smart casual look, natural light, full figure',
      'full body, honey-tipped dreadlocs, mustache soul patch, medium brown skin, right arm tattoo sleeve, relaxed tailored outfit, urban backdrop, full body head to toe',
    ],
    explicit: [
      'full body nude, honey-tipped dreadlocs, thin mustache soul patch, medium brown skin, tribal blackwork sleeve tattoo right arm only clean left arm, athletic figure, anatomically correct, standing',
      'nude full body, honey-tipped locs, mustache soul patch, medium brown skin, right arm tribal tattoo, masculine figure, natural confident pose, warm light, head to toe',
      'explicit full body, honey-tipped dreads, light facial hair, medium brown complexion, tribal tattoo right arm only, natural muscular build, standing confident, soft light',
      'nude standing, honey-tipped dreadlocs, thin mustache soul patch, medium brown skin, right arm sleeve tattoo, athletic build, relaxed pose, warm studio light, full body',
      'full body nude, honey-tipped locs, mustache soul patch, medium brown skin, tribal sleeve right arm clean left, masculine proportions, confident stance, diffused light, anatomically correct',
    ],
  },
  jaxon: {
    portrait: [
      'close portrait, shaved head low fade, light beard with goatee, heavy gold cuban chain, clean smooth skin no tattoos, direct confident gaze, strong jawline',
      'headshot, shaved head low cut, beard goatee, gold cuban link chain, clean skin, medium-dark brown complexion, intense expression, soft light',
      'close up face, shaved fade, light beard goatee, heavy gold chain, clean smooth skin, medium brown skin, magnetic confident look, warm light',
      'portrait, shaved head low fade, neat beard goatee, gold cuban chain, clean skin no tattoos, strong features, calm confident expression',
    ],
    clothed: [
      'full body, shaved head low fade, beard goatee, heavy gold cuban chain, clean skin no tattoos, fitted streetwear, confident stance, full figure head to toe visible',
      'full body standing, low fade shaved head, light beard, gold cuban chain, clean smooth skin, athletic build, casual outfit, natural light, full body in frame',
      'full body, shaved fade, beard goatee, heavy gold chain, no tattoos clean skin, fitted look, relaxed confident pose, urban setting, head to toe',
      'full body, low fade shaved head, neat beard goatee, gold cuban link chain, clean skin, athletic muscular build, stylish casual, full figure head to toe',
    ],
    explicit: [
      'full body nude, shaved head low fade, light beard goatee, heavy gold cuban chain, clean smooth skin no tattoos, athletic muscular figure, anatomically correct, standing',
      'nude full body, shaved fade, beard goatee, gold chain, clean skin, masculine athletic build, confident natural pose, warm light, head to toe visible',
      'explicit full body, shaved head low cut, beard goatee, gold cuban chain, no tattoos clean skin, muscular build, standing confident, soft studio light, anatomically correct',
      'nude standing, low fade shaved head, light beard goatee, heavy gold chain, clean skin, athletic proportions, relaxed pose, warm light, full body in frame',
      'full body nude, shaved head, beard goatee, gold cuban chain, clean smooth skin, masculine athletic figure, natural stance, diffused light, anatomically correct head to toe',
    ],
  },
  roman: {
    portrait: [
      'close portrait, bright vivid blue eyes, heavy freckles across cheeks and nose, golden brown biracial skin, short tight waves low fade, light scruffy stubble, silver rings',
      'headshot, vivid blue eyes, dense freckles cheeks and nose, golden biracial complexion, tight waves low fade, diamond stud earring, silver chain, creative expression',
      'close up face, striking blue eyes, heavy freckle pattern, golden brown skin, short waves fade, stubble, artistic sensitive look, warm light',
      'portrait, bright blue eyes, heavy freckles, golden brown biracial complexion, tight waves low fade, silver rings earring, intense creative expression',
    ],
    clothed: [
      'full body, vivid blue eyes, heavy freckles, golden brown skin, tight waves low fade, paint-streaked denim jacket silver rings, artist studio, full figure head to toe',
      'full body standing, blue eyes, dense freckles, golden biracial complexion, short waves fade, casual artist outfit, confident creative pose, full body visible',
      'full body, striking blue eyes, heavy freckles, golden brown skin, low fade waves, denim and tee silver jewelry, urban art space, head to toe in frame',
      'full body, vivid blue eyes, freckled golden brown skin, tight waves fade, diamond stud silver chain, relaxed artistic outfit, natural light, full figure',
    ],
    explicit: [
      'full body nude, bright vivid blue eyes, heavy freckles across cheeks and nose, golden brown biracial skin, short tight waves low fade, lean athletic figure, anatomically correct, standing',
      'nude full body, blue eyes, dense freckles, golden biracial complexion, tight waves fade, lean build, natural confident pose, warm light, head to toe visible',
      'explicit full body, striking blue eyes, heavy freckle pattern, golden brown skin, waves low fade, lean muscular figure, standing natural, soft studio light, anatomically correct',
      'nude standing, vivid blue eyes, heavy freckles, golden brown biracial skin, short waves fade, athletic proportions, relaxed pose, warm light, full body in frame',
      'full body nude, blue eyes, heavy freckles cheeks and nose, golden brown skin, tight waves low fade, lean figure, confident natural stance, diffused light, anatomically correct',
    ],
  },
};

// ─── Styles ────────────────────────────────────────────────────────────────

const SECTION: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '8px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--gold)',
  display: 'block',
  marginBottom: '14px',
};

const LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '7.5px',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--ivory-muted)',
  display: 'block',
  marginBottom: '6px',
};

const CHIP = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  background: active ? 'var(--gold-glow)' : 'transparent',
  border: `1px solid ${active ? 'var(--gold)' : 'var(--border-mid)'}`,
  borderRadius: '2px',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: '9px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  color: active ? 'var(--gold)' : 'var(--ivory-muted)',
});

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--charcoal-mid)',
  border: '1px solid var(--border-mid)',
  borderRadius: '3px',
  color: 'var(--ivory)',
  fontFamily: 'var(--font-body)',
  fontSize: '13px',
  outline: 'none',
  marginBottom: '10px',
};

// ─── Lora characters (only ones with trained LoRAs) ─────────────────────────

const LORA_CHARACTERS = [
  { id: 'soleil', name: 'Soleil', gender: 'F' },
  { id: 'zara', name: 'Zara', gender: 'F' },
  { id: 'nia', name: 'Nia', gender: 'F' },
  { id: 'jerome', name: 'Jerome', gender: 'M' },
  { id: 'jaxon', name: 'Jaxon', gender: 'M' },
  { id: 'roman', name: 'Roman', gender: 'M' },
];

const CATEGORY_LABELS: Record<PromptCategory, string> = {
  portrait: 'Portrait / Identity',
  clothed: 'Clothed Full Body',
  explicit: 'Explicit Full Body',
};

const CATEGORY_DESC: Record<PromptCategory, string> = {
  portrait: 'Face and identity anchors — establishes who the character is',
  clothed: 'Full figure with clothing — anchors body proportions and style',
  explicit: 'Nude full body — teaches NSFW anatomy for this character',
};

function storageKey(characterId: string, category: PromptCategory) {
  return `alyrax_training_${characterId}_${category}`;
}

// ─── Caption builder ────────────────────────────────────────────────────────

function buildCaption(characterId: string, prompt: string): string {
  const anchors: Record<string, string> = {
    soleil: 'Soleil, honey golden blonde braided hair, vivid green eyes, deep ebony black skin',
    zara: 'Zara, long sleek honey blonde hair, heavy freckles, light caramel skin',
    nia: 'Nia, long dark wavy locs, rich warm brown skin, warm brown eyes',
    jerome: 'Jerome, honey-tipped dreadlocs, thin mustache and soul patch, medium brown skin, tribal sleeve tattoo right arm',
    jaxon: 'Jaxon, shaved head low fade, light beard goatee, heavy gold cuban chain, clean skin',
    roman: 'Roman, bright vivid blue eyes, heavy freckles, golden brown biracial skin, short tight waves low fade',
  };
  return `A photo of ${anchors[characterId] ?? characterId}, ${prompt}, photorealistic, RAW DSLR photo`;
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function AdminTrainingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState<string>('soleil');
  const [anchorImageUrl, setAnchorImageUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<PromptCategory>('portrait');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [quantity, setQuantity] = useState<10 | 15 | 20 | 25>(10);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [viewerImage, setViewerImage] = useState<GeneratedImage | null>(null);
  const abortRef = useRef(false);

  // Auth check
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return; }
      fetch('/api/auth/me').then(r => r.json()).then(d => {
        if (!mounted) return;
        if (!d?.is_admin) { router.push('/login'); return; }
        setChecking(false);
      }).catch(() => { if (mounted) router.push('/login'); });
    });
    return () => { mounted = false; };
  }, [router, supabase]);

  // Load anchor image when character changes
  useEffect(() => {
    if (checking) return;
    setAnchorImageUrl(null);
    fetch(`/api/archetypes/gallery?archetype_id=${selectedCharacter}`)
      .then(r => r.json())
      .then(({ images: imgs }) => {
        const main = imgs?.find((i: { is_main: boolean; image_url: string }) => i.is_main) ?? imgs?.[0];
        if (main?.image_url) setAnchorImageUrl(main.image_url);
      })
      .catch(() => {});
  }, [selectedCharacter, checking]);

  // Reset preset when category changes
  useEffect(() => {
    setSelectedPreset(null);
    setCustomPrompt('');
  }, [category, selectedCharacter]);

  // Load persisted images when character or category changes
  useEffect(() => {
    if (checking) return;
    try {
      const stored = localStorage.getItem(storageKey(selectedCharacter, category));
      setImages(stored ? JSON.parse(stored) : []);
    } catch {
      setImages([]);
    }
  }, [selectedCharacter, category, checking]);

  // Persist images whenever they change — only keep selected ones
  useEffect(() => {
    if (checking) return;
    try {
      localStorage.setItem(storageKey(selectedCharacter, category), JSON.stringify(images.filter(img => img.selected)));
    } catch {
      // localStorage full or unavailable — ignore
    }
  }, [images, selectedCharacter, category, checking]);

  const activePrompt = customPrompt.trim()
    || (selectedPreset !== null ? CHARACTER_PROMPTS[selectedCharacter]?.[category]?.[selectedPreset] ?? '' : '');

  async function generate() {
    if (!activePrompt) return;
    const character = LORA_CHARACTERS.find(c => c.id === selectedCharacter);
    if (!character) return;

    // Look up LoRA config — must match lib/archetype-loras.ts
    const loraMap: Record<string, { loraFile: string; triggerWord: string }> = {
      soleil: { loraFile: 'soleil_v1.safetensors', triggerWord: 'solx' },
      zara:   { loraFile: 'zara_v1.safetensors',   triggerWord: 'zrabd' },
      nia:    { loraFile: 'nia_v1.safetensors',     triggerWord: 'niavx' },
      jerome: { loraFile: 'jerome_v1_flux.safetensors', triggerWord: 'jrmwr' },
      jaxon:  { loraFile: 'jaxon_v1.safetensors',  triggerWord: 'jxnst' },
      roman:  { loraFile: 'roman_v1.safetensors',  triggerWord: 'r0man' },
    };
    const lora = loraMap[selectedCharacter];
    if (!lora) return;

    // Pick style based on category
    const style = category === 'portrait' ? 'portrait' : 'fullbody';

    setGenerating(true);
    setImages(prev => prev.filter(img => img.selected));
    abortRef.current = false;

    const newImages: GeneratedImage[] = images.filter(img => img.selected);

    for (let i = 0; i < quantity; i++) {
      if (abortRef.current) break;
      setProgress(`Generating ${i + 1} of ${quantity}...`);

      try {
        // Step 1 — submit to Flux LoRA pipeline
        const submitRes = await fetch('/api/generate-flux-selfie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: activePrompt,
            lora_file: lora.loraFile,
            trigger_word: lora.triggerWord,
            style,
            character_id: selectedCharacter,
            seed: -1,
            nsfw_lora_strength: 0.5,
          }),
        });

        const submitData = await submitRes.json();
        if (!submitRes.ok) throw new Error(submitData.error || 'Submission failed');

        const jobId = submitData.jobId;
        if (!jobId) throw new Error('No jobId returned');

        // Step 2 — poll status
        setProgress(`Waiting on image ${i + 1} of ${quantity}...`);
        let imageUrl: string | null = null;

        for (let attempt = 0; attempt < 120; attempt++) {
          if (abortRef.current) break;
          await new Promise(r => setTimeout(r, 3000));

          const statusRes = await fetch(`/api/generate-companion/status/${jobId}`);
          const statusData = await statusRes.json();

          if (statusData.image_url) {
            imageUrl = statusData.image_url;
            break;
          }
          if (!statusRes.ok || statusData.error) {
            throw new Error(statusData.error || 'Generation failed');
          }
        }

        if (imageUrl) {
          newImages.push({
            id: `${Date.now()}-${i}`,
            url: imageUrl,
            prompt: activePrompt,
            selected: true,
          });
          setImages([...newImages]);
        }
      } catch (err) {
        console.error(`Image ${i + 1} failed:`, err);
      }
    }

    setProgress('');
    setGenerating(false);
  }

  function toggleImage(id: string) {
    setImages(prev => prev.map(img => img.id === id ? { ...img, selected: !img.selected } : img));
  }

  function selectAll() {
    setImages(prev => prev.map(img => ({ ...img, selected: true })));
  }

  function deselectAll() {
    setImages(prev => prev.map(img => ({ ...img, selected: false })));
  }

  async function downloadZip() {
    const selected = images.filter(img => img.selected);
    if (!selected.length) return;
    setDownloading(true);

    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const character = LORA_CHARACTERS.find(c => c.id === selectedCharacter)!;
      const folderName = `${character.name}_training_${category}`;
      const folder = zip.folder(folderName)!;

      // Add captions file
      const captions = selected.map((img, idx) => `${String(idx + 1).padStart(3, '0')}.jpg: ${buildCaption(selectedCharacter, img.prompt)}`).join('\n');
      folder.file('captions.txt', captions);

      // Fetch and add each image
      await Promise.all(selected.map(async (img, idx) => {
        try {
          const res = await fetch(`/api/admin/training/proxy-image?url=${encodeURIComponent(img.url)}`);
          if (!res.ok) throw new Error(`Proxy failed: ${res.status}`);
          const blob = await res.blob();
          folder.file(`${String(idx + 1).padStart(3, '0')}.jpg`, blob);
        } catch (err) {
          console.error(`Image ${idx + 1} download failed:`, err);
        }
      }));

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folderName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }

    setDownloading(false);
  }

  if (checking) {
    return (
      <div className="theme-dark" style={{ minHeight: '100dvh', background: 'var(--onyx)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--ivory-ghost)', textTransform: 'uppercase' }}>Verifying...</div>
      </div>
    );
  }

  const presets = CHARACTER_PROMPTS[selectedCharacter]?.[category] ?? [];
  const selectedCount = images.filter(i => i.selected).length;

  return (
    <div className="theme-dark" style={{ minHeight: '100dvh', background: 'var(--onyx)', padding: '32px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '6px' }}>
              ◈ Admin — Training Data
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--ivory)', marginBottom: '4px' }}>
              LoRA Training Set Generator
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ivory-ghost)' }}>
              Generate character-specific training images for Civitai LoRA retraining
            </div>
          </div>
          <button onClick={() => router.push('/admin/archetypes')} style={{ ...CHIP(false), marginTop: '4px' }}>
            ◁ Admin
          </button>
        </div>

        {/* Gold rule */}
        <div style={{ height: '1px', background: 'linear-gradient(90deg, var(--gold) 0%, transparent 100%)', marginBottom: '28px' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', alignItems: 'start' }}>

          {/* ── Left panel ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Character selector */}
            <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '18px' }}>
              <span style={SECTION}>◈ Character</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {LORA_CHARACTERS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCharacter(c.id)}
                    style={{
                      ...CHIP(selectedCharacter === c.id),
                      padding: '8px 10px',
                      textAlign: 'left' as const,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span style={{ fontSize: '8px' }}>{c.gender === 'F' ? '▽' : '△'}</span>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Anchor image */}
            <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '18px' }}>
              <span style={SECTION}>◈ Anchor Image</span>
              {anchorImageUrl ? (
                <img
                  src={anchorImageUrl}
                  alt="anchor"
                  style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', objectPosition: 'center top', borderRadius: '3px', border: '1px solid var(--border-mid)' }}
                />
              ) : (
                <div style={{ width: '100%', aspectRatio: '3/4', background: 'var(--charcoal-mid)', borderRadius: '3px', border: '1px solid var(--border-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--ivory-ghost)', letterSpacing: '0.14em' }}>No gallery image</span>
                </div>
              )}
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--ivory-ghost)', marginTop: '8px', lineHeight: 1.5 }}>
                Main gallery image used as InstantID reference to anchor identity during generation.
              </div>
            </div>

            {/* Category */}
            <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '18px' }}>
              <span style={SECTION}>◈ Category</span>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
                {(['portrait', 'clothed', 'explicit'] as PromptCategory[]).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    style={{
                      ...CHIP(category === cat),
                      textAlign: 'left' as const,
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column' as const,
                      gap: '3px',
                      height: 'auto',
                    }}
                  >
                    <span>{CATEGORY_LABELS[cat]}</span>
                    <span style={{ fontSize: '7px', opacity: 0.6, textTransform: 'none' as const, letterSpacing: '0.04em', fontFamily: 'var(--font-body)', lineHeight: 1.4 }}>
                      {CATEGORY_DESC[cat]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity */}
            <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '18px' }}>
              <span style={SECTION}>◈ Quantity</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {([10, 15, 20, 25] as const).map(q => (
                  <button key={q} onClick={() => setQuantity(q)} style={{ ...CHIP(quantity === q), flex: 1, textAlign: 'center' as const }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* ── Right panel ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Prompt selector */}
            <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '18px' }}>
              <span style={SECTION}>◈ Prompt</span>

              {/* Presets */}
              <div style={{ marginBottom: '14px' }}>
                <span style={LABEL}>Preset prompts</span>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
                  {presets.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => { setSelectedPreset(idx); setCustomPrompt(''); }}
                      style={{
                        ...CHIP(selectedPreset === idx && !customPrompt),
                        textAlign: 'left' as const,
                        padding: '10px 12px',
                        height: 'auto',
                        whiteSpace: 'normal' as const,
                        lineHeight: 1.5,
                        fontSize: '10px',
                        letterSpacing: '0.04em',
                        textTransform: 'none' as const,
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom */}
              <span style={LABEL}>Or write your own</span>
              <textarea
                value={customPrompt}
                onChange={e => { setCustomPrompt(e.target.value); setSelectedPreset(null); }}
                placeholder="Describe the scene, pose, and details..."
                rows={3}
                style={{
                  ...INPUT,
                  resize: 'vertical' as const,
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  marginBottom: 0,
                }}
              />

              {/* Active prompt preview */}
              {activePrompt && (
                <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--charcoal-mid)', borderRadius: '3px', border: '1px solid var(--border-dark)' }}>
                  <div style={{ ...LABEL, marginBottom: '4px' }}>Active prompt</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ivory-dim)', lineHeight: 1.5 }}>
                    {activePrompt}
                  </div>
                </div>
              )}
            </div>

            {/* Generate button */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={generate}
                disabled={generating || !activePrompt}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  background: generating || !activePrompt ? 'transparent' : 'var(--gold)',
                  border: `1px solid ${generating || !activePrompt ? 'var(--border-mid)' : 'var(--gold)'}`,
                  borderRadius: '3px',
                  cursor: generating || !activePrompt ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase' as const,
                  color: generating || !activePrompt ? 'var(--ivory-ghost)' : 'var(--onyx)',
                  opacity: generating || !activePrompt ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {generating ? `◈ ${progress}` : `◈ Generate ${quantity} Images`}
              </button>
              {generating && (
                <button
                  onClick={() => { abortRef.current = true; }}
                  style={{ ...CHIP(false), padding: '12px 16px' }}
                >
                  Stop
                </button>
              )}
            </div>

            {/* Results grid */}
            {images.length > 0 && (
              <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '18px' }}>

                {/* Grid controls */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <span style={{ ...SECTION, marginBottom: 0 }}>
                    ◈ Results — {selectedCount} of {images.length} selected
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={selectAll} style={CHIP(false)}>Select All</button>
                    <button onClick={deselectAll} style={CHIP(false)}>Deselect All</button>
                    <button
                      onClick={downloadZip}
                      disabled={downloading || selectedCount === 0}
                      style={{
                        ...CHIP(false),
                        background: selectedCount > 0 && !downloading ? 'var(--gold-glow)' : 'transparent',
                        borderColor: selectedCount > 0 && !downloading ? 'var(--gold)' : 'var(--border-mid)',
                        color: selectedCount > 0 && !downloading ? 'var(--gold)' : 'var(--ivory-ghost)',
                        opacity: selectedCount === 0 || downloading ? 0.5 : 1,
                        cursor: selectedCount === 0 || downloading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {downloading ? 'Zipping...' : `↓ Download ${selectedCount > 0 ? `(${selectedCount})` : ''}`}
                    </button>
                  </div>
                </div>

                {/* Image grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                  {images.map(img => (
                    <div
                      key={img.id}
                      onClick={() => toggleImage(img.id)}
                      style={{
                        position: 'relative',
                        cursor: 'pointer',
                        borderRadius: '3px',
                        overflow: 'hidden',
                        border: `2px solid ${img.selected ? 'var(--gold)' : 'transparent'}`,
                        transition: 'border-color 0.15s',
                        aspectRatio: '3/4',
                      }}
                    >
                      <img
                        src={img.url}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: img.selected ? 1 : 0.4, transition: 'opacity 0.15s' }}
                      />
                      {img.selected && (
                        <div style={{ position: 'absolute', top: '6px', right: '6px', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: '10px', color: 'var(--onyx)', lineHeight: 1 }}>✓</span>
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setViewerImage(img); }}
                        style={{
                          position: 'absolute',
                          top: '6px',
                          left: '6px',
                          width: '22px',
                          height: '22px',
                          borderRadius: '3px',
                          background: 'rgba(0,0,0,0.55)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                        aria-label="Enlarge image"
                      >
                        <span style={{ fontSize: '11px', color: 'var(--ivory)', lineHeight: 1 }}>⤢</span>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Caption preview */}
                <div style={{ marginTop: '14px', padding: '10px 12px', background: 'var(--charcoal-mid)', borderRadius: '3px', border: '1px solid var(--border-dark)' }}>
                  <div style={{ ...LABEL, marginBottom: '4px' }}>Caption format (included in zip)</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ivory-ghost)', lineHeight: 1.6 }}>
                    {buildCaption(selectedCharacter, activePrompt)}
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>

        {/* Image viewer modal */}
        {viewerImage && (
          <div
            onClick={() => setViewerImage(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '32px',
              cursor: 'pointer',
            }}
          >
            <img
              src={viewerImage.url}
              alt=""
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain',
                borderRadius: '4px',
                border: '1px solid var(--border-mid)',
                cursor: 'default',
              }}
            />
            <button
              onClick={() => setViewerImage(null)}
              style={{
                position: 'absolute',
                top: '24px',
                right: '24px',
                width: '36px',
                height: '36px',
                borderRadius: '3px',
                background: 'rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'var(--ivory)',
                fontSize: '18px',
                cursor: 'pointer',
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
