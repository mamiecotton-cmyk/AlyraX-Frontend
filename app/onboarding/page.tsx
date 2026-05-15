'use client';
import { type ChangeEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

const BODY_TYPES = ['Petite', 'Slim', 'Athletic', 'Curvy', 'Plus size'];
const HAIR_COLORS = ['Black', 'Brown', 'Blonde', 'Red', 'Silver', 'Auburn'];
const HAIR_STYLES = ['Long straight', 'Long curly', 'Short', 'Wavy', 'Braids', 'Natural'];
const EYE_COLORS = ['Brown', 'Blue', 'Green', 'Hazel', 'Grey', 'Amber'];
const VIBES = ['Elegant', 'Mysterious', 'Playful', 'Bold', 'Sweet', 'Edgy'];
const AGE_RANGES = ['20s', '30s', '40s', '50s', '60s', '70s', '80s'];
const ETHNICITIES = ['Black', 'White', 'Latina', 'Asian', 'Middle Eastern', 'Mixed', 'Other'];

function getAgePrompt(ageRange: string) {
  return `age ${ageRange}`;
}

const PERSONAS = [
  { id: null as string | null, name: 'AlyraX Classic', tagline: 'Your secret is safe with me.', description: 'Sultry, confident, sophisticated. She reads the room.', premium: false },
  { id: null as string | null, name: 'The Dominant', tagline: "She doesn't ask. She takes.", description: 'In complete control. Quiet authority. One instruction at a time.', premium: true, price: '$9.99' },
  { id: null as string | null, name: 'The Submissive', tagline: "She's been waiting for you.", description: 'Warm, eager, devoted. She anticipates everything you need.', premium: true, price: '$9.99' },
];

const CHIP_STYLE = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  border: `1px solid ${active ? 'var(--gold)' : 'var(--border-mid)'}`,
  borderRadius: '2px',
  background: active ? 'var(--gold-glow)' : 'transparent',
  color: active ? 'var(--gold)' : 'var(--ivory-muted)',
  fontFamily: 'var(--font-body)',
  fontSize: '12px',
  cursor: 'pointer',
  transition: 'all 0.15s',
});

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '8px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--ivory-ghost)',
  marginBottom: '10px',
  display: 'block',
};

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep]           = useState(1);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [generatedImage, setGeneratedImage] = useState('');
  const [generatedSeed, setGeneratedSeed]   = useState<number | null>(null);
  const [inspirationImageUrl, setInspirationImageUrl] = useState('');
  const [inspirationStatus, setInspirationStatus]     = useState('');
  const [companionName, setCompanionName] = useState('AlyraX');
  const [selectedPersonaIndex, setSelectedPersonaIndex] = useState(0);

  const [bodyType, setBodyType] = useState('');
  const [ethnicity, setEthnicity] = useState('');
  const [hairColor, setHairColor] = useState('');
  const [hairStyle, setHairStyle] = useState('');
  const [eyeColor, setEyeColor]   = useState('');
  const [vibe, setVibe]           = useState('');
  const [ageRange, setAgeRange]   = useState('30s');
  const [freeText, setFreeText]   = useState('');

  function buildPrompt() {
    const parts: string[] = [];
    if (ethnicity) parts.push(ethnicity.toLowerCase());
    if (ageRange)  parts.push(getAgePrompt(ageRange));
    if (bodyType)  parts.push(bodyType.toLowerCase());
    if (hairColor && hairStyle) parts.push(`${hairColor.toLowerCase()} ${hairStyle.toLowerCase()} hair`);
    else if (hairColor) parts.push(`${hairColor.toLowerCase()} hair`);
    else if (hairStyle) parts.push(`${hairStyle.toLowerCase()} hair`);
    if (eyeColor)  parts.push(`${eyeColor.toLowerCase()} eyes`);
    if (vibe)      parts.push(vibe.toLowerCase());
    if (freeText)  parts.push(freeText);
    return parts.filter(Boolean).join(', ');
  }

  async function uploadInspirationImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setInspirationStatus('Uploading...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const fileName = `${user.id}/inspiration/${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from('companions').upload(fileName, file, { contentType: file.type || 'image/png', upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('companions').getPublicUrl(data.path);
      setInspirationImageUrl(urlData.publicUrl);
      setInspirationStatus('Inspiration saved');
    } catch { setInspirationStatus('Upload failed'); }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const response = await fetch('/api/generate-companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: buildPrompt(),
          style: 'portrait',
          reference_image_url: inspirationImageUrl || undefined,
          reference_strength: inspirationImageUrl ? 0.82 : undefined,
          reference_mode: inspirationImageUrl ? 'inspiration' : undefined,
        }),
      });
      const data = await response.json();
      if (data.image_url) {
        setGeneratedImage(data.image_url);
        setGeneratedSeed(typeof data.seed === 'number' ? data.seed : null);
        setStep(3);
      }
    } catch (e) { console.error('Generation failed:', e); }
    setGenerating(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch('/api/companion/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companionName, imageUrl: generatedImage, promptUsed: buildPrompt(),
          generationSeed: generatedSeed, personaIndex: selectedPersonaIndex,
          bodyType, ethnicity, hairColor, hairStyle, eyeColor, vibe, ageRange, inspirationImageUrl,
        }),
      });
      if (!response.ok) throw new Error('Save failed');
      router.push('/dashboard');
    } catch { setSaving(false); }
  }

  const STEP_LABELS = ['Design', 'Personality', 'Meet'];

  return (
    <div style={{ minHeight: '100dvh', width: '100%', background: 'var(--onyx)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--gold)', letterSpacing: '0.12em' }}>ALYRA X</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', marginTop: '4px' }}>Create Your Companion</div>
        </div>

        {/* Step progress */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
          {STEP_LABELS.map((label, i) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: '1px', background: step > i + 1 ? 'var(--gold)' : step === i + 1 ? 'var(--gold)' : 'var(--border-mid)', marginBottom: '6px', transition: 'background 0.3s' }} />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: step === i + 1 ? 'var(--gold)' : 'var(--ivory-ghost)' }}>
                {step > i + 1 ? '✓ ' : ''}{label}
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border-dark)', borderRadius: '3px', padding: '28px' }}>

          {/* STEP 1 */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--ivory)', marginBottom: '2px' }}>Design her</div>
                <div style={{ fontSize: '12px', color: 'var(--ivory-muted)' }}>Build her appearance from the ground up.</div>
              </div>

              {/* Inspiration upload */}
              <div style={{ padding: '14px', border: '1px solid var(--border-mid)', borderRadius: '2px' }}>
                <span style={SECTION_LABEL}>Inspiration Image (optional)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ display: 'inline-block', padding: '6px 14px', border: '1px solid var(--border-mid)', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ivory-muted)' }}>
                    Choose Image
                    <input type="file" accept="image/*" onChange={uploadInspirationImage} style={{ display: 'none' }} />
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--ivory-ghost)' }}>{inspirationStatus || 'Loose inspiration only'}</span>
                </div>
                {inspirationImageUrl && (
                  <img src={inspirationImageUrl} alt="Inspiration" style={{ marginTop: '10px', height: '80px', width: '64px', objectFit: 'cover', borderRadius: '2px', border: '1px solid var(--border-mid)' }} />
                )}
              </div>

              {/* Chips */}
              {[
                { label: 'Body Type', items: BODY_TYPES, val: bodyType, set: setBodyType },
                { label: 'Ethnicity', items: ETHNICITIES, val: ethnicity, set: setEthnicity },
                { label: 'Hair Color', items: HAIR_COLORS, val: hairColor, set: setHairColor },
                { label: 'Hair Style', items: HAIR_STYLES, val: hairStyle, set: setHairStyle },
                { label: 'Eye Color', items: EYE_COLORS, val: eyeColor, set: setEyeColor },
                { label: 'Her Vibe', items: VIBES, val: vibe, set: setVibe },
                { label: 'Age Range', items: AGE_RANGES, val: ageRange, set: setAgeRange },
              ].map(({ label, items, val, set }) => (
                <div key={label}>
                  <span style={SECTION_LABEL}>{label}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {items.map((item) => (
                      <button key={item} onClick={() => set(item)} style={CHIP_STYLE(val === item)}>{item}</button>
                    ))}
                  </div>
                </div>
              ))}

              <div>
                <span style={SECTION_LABEL}>Additional Details</span>
                <textarea
                  style={{ width: '100%', background: 'var(--charcoal-mid)', border: '1px solid var(--border-mid)', borderRadius: '2px', padding: '10px 12px', color: 'var(--ivory)', fontFamily: 'var(--font-body)', fontSize: '12px', outline: 'none', resize: 'vertical' }}
                  rows={2}
                  placeholder="tattoos, posture, natural makeup, tall..."
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                />
              </div>

              <button onClick={() => setStep(2)} className="btn-gold" style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
                ▷ Next — Choose Personality
              </button>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--ivory)', marginBottom: '2px' }}>Her personality</div>
                <div style={{ fontSize: '12px', color: 'var(--ivory-muted)' }}>Choose who she is behind the portrait.</div>
              </div>

              {PERSONAS.map((persona, index) => (
                <button
                  key={persona.name}
                  onClick={() => setSelectedPersonaIndex(index)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '14px 16px',
                    background: selectedPersonaIndex === index ? 'var(--gold-glow)' : 'var(--charcoal-mid)',
                    border: `1px solid ${selectedPersonaIndex === index ? 'var(--gold)' : 'var(--border-mid)'}`,
                    borderRadius: '2px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: 'var(--ivory)' }}>{persona.name}</span>
                    {persona.premium && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.14em', color: 'var(--gold)', border: '1px solid var(--gold-dim)', padding: '2px 7px', borderRadius: '2px' }}>{persona.price}</span>}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontStyle: 'italic', color: 'var(--gold)', marginBottom: '3px' }}>{persona.tagline}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--ivory-muted)' }}>{persona.description}</div>
                </button>
              ))}

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={() => setStep(1)} className="btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '11px' }}>◁ Back</button>
                <button onClick={handleGenerate} disabled={generating} className="btn-gold" style={{ flex: 2, justifyContent: 'center', padding: '11px', opacity: generating ? 0.7 : 1 }}>
                  {generating ? 'Creating her...' : generatedImage ? '◆ Generate New' : '◆ Generate Her'}
                </button>
              </div>

              {generating && (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontStyle: 'italic', color: 'var(--ivory-muted)', marginBottom: '4px' }}>Bringing her to life...</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em', color: 'var(--ivory-ghost)' }}>First generation takes 1–2 minutes.</div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--ivory)', marginBottom: '2px' }}>Meet her</div>
                <div style={{ fontSize: '12px', color: 'var(--ivory-muted)' }}>Give her a name, then make her yours.</div>
              </div>

              {generatedImage && (
                <div style={{ position: 'relative', borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--gold-dim)' }}>
                  <img src={generatedImage} alt="Your companion" style={{ width: '180px', height: '240px', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', top: '8px', left: '8px', right: '8px', height: '1px', background: 'rgba(212,175,55,0.3)' }} />
                  <div style={{ position: 'absolute', bottom: '8px', left: '8px', right: '8px', height: '1px', background: 'rgba(212,175,55,0.3)' }} />
                </div>
              )}

              <div style={{ width: '100%' }}>
                <span style={SECTION_LABEL}>Her Name</span>
                <input
                  type="text"
                  value={companionName}
                  onChange={(e) => setCompanionName(e.target.value)}
                  style={{ display: 'block', width: '100%', padding: '10px 13px', background: 'var(--charcoal-mid)', border: '1px solid var(--border-mid)', borderRadius: '2px', color: 'var(--ivory)', fontFamily: 'var(--font-display)', fontSize: '16px', outline: 'none' }}
                  onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--gold-dim)')}
                  onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = 'var(--border-mid)')}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <button onClick={() => setStep(2)} className="btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '10px' }}>◁ Edit</button>
                <button onClick={handleGenerate} disabled={generating} className="btn-ghost" style={{ justifyContent: 'center', padding: '10px 14px', opacity: generating ? 0.6 : 1 }}>↺</button>
                <button onClick={handleSave} disabled={saving} className="btn-gold" style={{ flex: 2, justifyContent: 'center', padding: '10px', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving...' : "◈ She's perfect →"}
                </button>
              </div>
            </div>
          )}

        </div>

        <div style={{ textAlign: 'center', marginTop: '20px', fontFamily: 'var(--font-mono)', fontSize: '7.5px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ivory-ghost)' }}>
          Discreet Billing · AA Technical Services
        </div>
      </div>
    </div>
  );
}