'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const BODY_TYPES = ['Petite', 'Slim', 'Athletic', 'Curvy', 'Plus size'];
const HAIR_COLORS = ['Black', 'Brown', 'Blonde', 'Red', 'Silver', 'Auburn'];
const HAIR_STYLES = ['Long straight', 'Long curly', 'Short', 'Wavy', 'Braids', 'Natural'];
const EYE_COLORS = ['Brown', 'Blue', 'Green', 'Hazel', 'Grey', 'Amber'];
const VIBES = ['Elegant', 'Mysterious', 'Playful', 'Bold', 'Sweet', 'Edgy'];
const AGE_RANGES = ['20s', '30s', '40s', '50s', '60s', '70s', '80s'];
const ETHNICITIES = ['Black', 'White', 'Latina', 'Asian', 'Middle Eastern', 'Mixed', 'Other'];

const PERSONAS = [
  {
    id: null as string | null,
    name: 'AlyraX Classic',
    tagline: 'Your secret is safe with me.',
    description: 'Sultry, confident, sophisticated. She reads the room.',
    premium: false,
  },
  {
    id: null as string | null,
    name: 'The Dominant',
    tagline: "She doesn't ask. She takes.",
    description: 'In complete control. Quiet authority. One instruction at a time.',
    premium: true,
    price: '$9.99',
  },
  {
    id: null as string | null,
    name: 'The Submissive',
    tagline: "She's been waiting for you.",
    description: 'Warm, eager, devoted. She anticipates everything you need.',
    premium: true,
    price: '$9.99',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatedImage, setGeneratedImage] = useState('');
  const [companionName, setCompanionName] = useState('AlyraX');
  const [selectedPersonaIndex, setSelectedPersonaIndex] = useState(0);

  // Guided prompts
  const [bodyType, setBodyType] = useState('');
  const [ethnicity, setEthnicity] = useState('');
  const [hairColor, setHairColor] = useState('');
  const [hairStyle, setHairStyle] = useState('');
  const [eyeColor, setEyeColor] = useState('');
  const [vibe, setVibe] = useState('');
  const [ageRange, setAgeRange] = useState('30s');
  const [freeText, setFreeText] = useState('');

  const buildPrompt = () => {
    const parts = [];
    if (bodyType) parts.push(`${bodyType.toLowerCase()} body type`);
    if (ethnicity) parts.push(`${ethnicity.toLowerCase()} woman`);
    if (hairColor && hairStyle) parts.push(`${hairColor.toLowerCase()} ${hairStyle.toLowerCase()} hair`);
    if (eyeColor) parts.push(`${eyeColor.toLowerCase()} eyes`);
    if (vibe) parts.push(`${vibe.toLowerCase()} style`);
    if (ageRange) parts.push(`${ageRange}`);
    if (freeText) parts.push(freeText);
    return parts.join(', ');
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const prompt = buildPrompt();
      const response = await fetch('/api/generate-companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: prompt, style: 'portrait' }),
      });
      const data = await response.json();
      if (data.image_url) {
        setGeneratedImage(data.image_url);
        setStep(3);
      }
    } catch (error) {
      console.error('Generation failed:', error);
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get persona ID from database
      const { data: personas } = await supabase
        .from('personas')
        .select('id, name')
        .order('sort_order');

      const selectedPersona = personas?.[selectedPersonaIndex];

      // Save companion
      await supabase.from('companions').insert({
        user_id: user.id,
        persona_id: selectedPersona?.id,
        name: companionName,
        image_url: generatedImage,
        prompt_used: buildPrompt(),
      });

      // Initialize credits at 0
      await supabase.from('credits').upsert({
        user_id: user.id,
        balance_seconds: 0,
      });

      router.push('/dashboard');
    } catch (error) {
      console.error('Save failed:', error);
    }
    setSaving(false);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-lg border border-gray-800 rounded-2xl bg-zinc-900/50 p-8">

        {/* Header */}
        <h1 className="text-3xl font-bold text-red-600 tracking-tighter mb-1">AlyraX</h1>
        <p className="text-gray-500 text-sm mb-6">
          Step {step} of 3 — {step === 1 ? 'Design her' : step === 2 ? 'Choose her personality' : 'Meet her'}
        </p>

        {/* Progress bar */}
        <div className="w-full bg-gray-800 rounded-full h-1 mb-8">
          <div
            className="bg-red-600 h-1 rounded-full transition-all duration-500"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* STEP 1 — Design */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <h2 className="text-xl font-bold">Design your companion</h2>

            {/* Body Type */}
            <div>
              <label className="text-xs uppercase text-gray-500 tracking-widest mb-2 block">Body Type</label>
              <div className="flex flex-wrap gap-2">
                {BODY_TYPES.map(b => (
                  <button
                    key={b}
                    onClick={() => setBodyType(b)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${bodyType === b ? 'border-red-500 text-red-500' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Ethnicity */}
            <div>
              <label className="text-xs uppercase text-gray-500 tracking-widest mb-2 block">Ethnicity</label>
              <div className="flex flex-wrap gap-2">
                {ETHNICITIES.map(e => (
                  <button
                    key={e}
                    onClick={() => setEthnicity(e)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${ethnicity === e ? 'border-red-500 text-red-500' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Hair */}
            <div>
              <label className="text-xs uppercase text-gray-500 tracking-widest mb-2 block">Hair Color</label>
              <div className="flex flex-wrap gap-2">
                {HAIR_COLORS.map(h => (
                  <button
                    key={h}
                    onClick={() => setHairColor(h)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${hairColor === h ? 'border-red-500 text-red-500' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Hair Style */}
            <div>
              <label className="text-xs uppercase text-gray-500 tracking-widest mb-2 block">Hair Style</label>
              <div className="flex flex-wrap gap-2">
                {HAIR_STYLES.map(h => (
                  <button
                    key={h}
                    onClick={() => setHairStyle(h)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${hairStyle === h ? 'border-red-500 text-red-500' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Eyes */}
            <div>
              <label className="text-xs uppercase text-gray-500 tracking-widest mb-2 block">Eye Color</label>
              <div className="flex flex-wrap gap-2">
                {EYE_COLORS.map(e => (
                  <button
                    key={e}
                    onClick={() => setEyeColor(e)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${eyeColor === e ? 'border-red-500 text-red-500' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Vibe */}
            <div>
              <label className="text-xs uppercase text-gray-500 tracking-widest mb-2 block">Her Vibe</label>
              <div className="flex flex-wrap gap-2">
                {VIBES.map(v => (
                  <button
                    key={v}
                    onClick={() => setVibe(v)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${vibe === v ? 'border-red-500 text-red-500' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Age */}
            <div>
              <label className="text-xs uppercase text-gray-500 tracking-widest mb-2 block">Age Range</label>
              <div className="flex gap-2">
                {AGE_RANGES.map(a => (
                  <button
                    key={a}
                    onClick={() => setAgeRange(a)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${ageRange === a ? 'border-red-500 text-red-500' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Free text */}
            <div>
              <label className="text-xs uppercase text-gray-500 tracking-widest mb-2 block">Anything else? (optional)</label>
              <textarea
                className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-sm focus:border-red-500 outline-none transition"
                rows={2}
                placeholder="e.g. tall, confident posture, tattoos, natural makeup..."
                value={freeText}
                onChange={e => setFreeText(e.target.value)}
              />
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition"
            >
              Next — Choose Her Personality
            </button>
          </div>
        )}

        {/* STEP 2 — Persona */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <h2 className="text-xl font-bold">Choose her personality</h2>

            {PERSONAS.map((persona, index) => (
              <button
                key={persona.name}
                onClick={() => setSelectedPersonaIndex(index)}
                className={`w-full text-left p-4 rounded-xl border transition ${selectedPersonaIndex === index ? 'border-red-500 bg-red-950/20' : 'border-gray-700 hover:border-gray-500'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold">{persona.name}</span>
                  {persona.premium && (
                    <span className="text-xs text-yellow-500 border border-yellow-500/30 rounded-full px-2 py-0.5">
                      {persona.price} unlock
                    </span>
                  )}
                </div>
                <p className="text-red-400 text-sm italic mb-1">{persona.tagline}</p>
                <p className="text-gray-500 text-sm">{persona.description}</p>
              </button>
            ))}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border border-gray-700 text-gray-400 py-3 rounded-xl font-bold hover:border-gray-500 transition"
              >
                Back
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition disabled:opacity-50"
              >
                {generating ? 'Creating her...' : 'Generate Her'}
              </button>
            </div>

            {generating && (
              <p className="text-center text-gray-500 text-sm animate-pulse">
                Bringing her to life... this takes about 30 seconds
              </p>
            )}
          </div>
        )}

        {/* STEP 3 — Meet her */}
        {step === 3 && (
          <div className="flex flex-col gap-5 items-center">
            <h2 className="text-xl font-bold">Meet her</h2>

            {generatedImage && (
              <img
                src={generatedImage}
                alt="Your companion"
                className="w-48 h-64 object-cover rounded-2xl border border-gray-700"
              />
            )}

            <div className="w-full">
              <label className="text-xs uppercase text-gray-500 tracking-widest mb-2 block">
                Give her a name
              </label>
              <input
                type="text"
                value={companionName}
                onChange={e => setCompanionName(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-red-500 outline-none transition"
                placeholder="AlyraX"
              />
            </div>

            <div className="flex gap-3 w-full">
              <button
                onClick={() => setStep(2)}
                className="flex-1 border border-gray-700 text-gray-400 py-3 rounded-xl font-bold hover:border-gray-500 transition"
              >
                Regenerate
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : "She's perfect →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
