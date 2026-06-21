'use client';

import { type ChangeEvent, type ReactNode, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { archetypes } from '@/lib/archetypes';
import { createClient } from '@/lib/supabase';
import { resolveGeneratedImageResponse, type GeneratedImageResult } from '@/lib/image-generation-client';

const BODY_TYPES = ['Petite', 'Slim', 'Athletic', 'Curvy', 'Plus size'];
const HAIR_COLORS = ['Black', 'Brown', 'Blonde', 'Red', 'Silver', 'Auburn'];
const HAIR_STYLES = ['Long straight', 'Long curly', 'Short', 'Wavy', 'Braids', 'Natural'];
const EYE_COLORS = ['Brown', 'Blue', 'Green', 'Hazel', 'Grey', 'Amber'];
const VIBES = ['Elegant', 'Mysterious', 'Playful', 'Bold', 'Sweet', 'Edgy'];
const AGE_RANGES = ['20s', '30s', '40s', '50s', '60s', '70s', '80s'];
const ETHNICITIES = ['Black', 'White', 'Latina', 'Asian', 'Middle Eastern', 'Mixed', 'Other'];
const AVATAR_GENDERS = ['Woman', 'Man', 'Nonbinary'];
const SKIN_TONES = ['Deep ebony', 'Rich brown', 'Caramel brown', 'Honey tan', 'Olive', 'Fair'];
const AVATAR_STYLES = ['Casual', 'Polished', 'Streetwear', 'Elegant', 'Athletic', 'Soft'];

type CompanionMode = 'roster' | 'custom';

function getAgePrompt(ageRange: string) {
  if (!ageRange) return '';
  if (ageRange === '20s') return 'age 25-29';
  if (ageRange === '30s') return 'age 30-39';
  if (ageRange === '40s') return 'mature, age 40-49';
  if (ageRange === '50s') return 'mature, age 50-59';
  if (ageRange === '60s') return 'age 60-69';
  if (ageRange === '70s') return 'age 70-79';
  if (ageRange === '80s') return 'age 80-89';
  return `age ${ageRange}`;
}

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs uppercase text-gray-500 tracking-widest mb-2 block">{label}</label>
      {children}
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition ${active ? 'border-red-500 text-red-500' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
    >
      {label}
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState(1);
  const [companionMode, setCompanionMode] = useState<CompanionMode>('roster');
  const [selectedArchetypeId, setSelectedArchetypeId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatedImage, setGeneratedImage] = useState('');
  const [inspirationImageUrl, setInspirationImageUrl] = useState('');
  const [inspirationStatus, setInspirationStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [companionName, setCompanionName] = useState('AlyraX');
  const [selectedPersonaIndex, setSelectedPersonaIndex] = useState(0);

  const [bodyType, setBodyType] = useState('');
  const [ethnicity, setEthnicity] = useState('');
  const [hairColor, setHairColor] = useState('');
  const [hairStyle, setHairStyle] = useState('');
  const [eyeColor, setEyeColor] = useState('');
  const [vibe, setVibe] = useState('');
  const [ageRange, setAgeRange] = useState('30s');
  const [freeText, setFreeText] = useState('');

  const [avBodyType, setAvBodyType] = useState('');
  const [avGender, setAvGender] = useState('');
  const [avSkinTone, setAvSkinTone] = useState('');
  const [avHairColor, setAvHairColor] = useState('');
  const [avHairStyle, setAvHairStyle] = useState('');
  const [avStyle, setAvStyle] = useState('');
  const [avFreeText, setAvFreeText] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);

  const [userName, setUserName] = useState('');
  const [companionNickname, setCompanionNickname] = useState('');
  const [howWeMet, setHowWeMet] = useState('');

  const selectedArchetype = archetypes.find((archetype) => archetype.id === selectedArchetypeId);

  const buildPromptFromDraft = (draft: {
    bodyType: string;
    ethnicity: string;
    hairColor: string;
    hairStyle: string;
    eyeColor: string;
    vibe: string;
    ageRange: string;
    freeText: string;
  }) => {
    const parts = [];
    if (draft.ethnicity) parts.push(`${draft.ethnicity.toLowerCase()} woman`);
    if (draft.ageRange) parts.push(getAgePrompt(draft.ageRange));
    if (draft.bodyType) parts.push(`${draft.bodyType.toLowerCase()} body`);
    if (draft.hairColor && draft.hairStyle) parts.push(`${draft.hairColor.toLowerCase()} ${draft.hairStyle.toLowerCase()} hair`);
    if (draft.eyeColor) parts.push(`${draft.eyeColor.toLowerCase()} eyes`);
    if (draft.vibe) parts.push(`${draft.vibe.toLowerCase()} style`);
    if (draft.freeText) parts.push(draft.freeText);
    return parts.join(', ');
  };

  const getDraft = () => ({
    bodyType,
    ethnicity,
    hairColor,
    hairStyle,
    eyeColor,
    vibe,
    ageRange,
    freeText,
    selectedPersonaIndex,
    companionName,
  });

  const buildPrompt = () => buildPromptFromDraft(getDraft());

  const uploadInspirationImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setInspirationStatus('Uploading inspiration');
    setErrorMessage('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const formData = new FormData();
      formData.set('file', file);
      formData.set('kind', 'inspiration');

      const response = await fetch('/api/storage/r2-upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || 'Upload failed');

      setInspirationImageUrl(data.url as string);
      setInspirationStatus('Inspiration saved');
    } catch (error) {
      console.error('Inspiration upload failed:', error);
      setInspirationStatus('Inspiration upload failed');
    }
  };

  const generateCustomCompanionImage = async (): Promise<GeneratedImageResult> => {
    setGenerating(true);
    setErrorMessage('');
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
      const generated = await resolveGeneratedImageResponse(response, data);
      setGeneratedImage(generated.imageUrl);
      return generated;
    } finally {
      setGenerating(false);
    }
  };

  const generateAvatar = async () => {
    setAvatarBusy(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/avatar/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gender: avGender,
          bodyType: avBodyType,
          skinTone: avSkinTone,
          hairColor: avHairColor,
          hairStyle: avHairStyle,
          style: avStyle,
          freeText: avFreeText,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Avatar generation failed');
      if (data?.avatar?.image_url) setAvatarUrl(data.avatar.image_url);
    } catch (error) {
      console.error('Avatar generation failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Avatar generation failed');
    } finally {
      setAvatarBusy(false);
    }
  };

  const saveCustomCompanion = async (imageUrl: string) => {
    const response = await fetch('/api/companion/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companionName,
        imageUrl,
        promptUsed: buildPrompt(),
        personaIndex: selectedPersonaIndex,
        bodyType,
        ethnicity,
        hairColor,
        hairStyle,
        eyeColor,
        vibe,
        ageRange,
        inspirationImageUrl,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Companion save failed');
    }

    return response.json();
  };

  async function seedRelationshipFacts(archetypeId: string) {
    const facts = [
      userName ? `The user's name is ${userName}.` : '',
      companionNickname ? `The user likes to be called "${companionNickname}".` : '',
      howWeMet ? `Shared backstory: ${howWeMet}` : '',
    ].filter(Boolean);

    if (facts.length) {
      await fetch('/api/companion/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetypeId, facts }),
      });
    }

    if (companionNickname) {
      await fetch('/api/chat/nickname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetype_id: archetypeId, companion_nickname: companionNickname }),
      });
    }
  }

  async function handleFinish() {
    setSaving(true);
    setErrorMessage('');
    try {
      let archetypeId = selectedArchetypeId;

      if (companionMode === 'roster') {
        if (!selectedArchetypeId) throw new Error('Choose a companion first');
        const response = await fetch('/api/companion/create-from-archetype', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archetypeId: selectedArchetypeId }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Companion setup failed');
      } else {
        const imageUrl = generatedImage || (await generateCustomCompanionImage()).imageUrl;
        await saveCustomCompanion(imageUrl);
        archetypeId = '';
      }

      if (archetypeId) await seedRelationshipFacts(archetypeId);
      if (avGender) {
        await supabase.auth.updateUser({
          data: {
            alyrax_user_gender: avGender,
            avatar_gender: avGender,
          },
        });
      }
      router.push('/dashboard');
    } catch (error) {
      console.error('Onboarding finish failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Onboarding failed');
    } finally {
      setSaving(false);
    }
  }

  const canAdvanceFromStep1 = companionMode === 'roster' ? Boolean(selectedArchetypeId) : true;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-3xl border border-gray-800 rounded-2xl bg-zinc-900/50 p-8">
        <h1 className="text-3xl font-bold text-red-600 tracking-tighter mb-1">AlyraX</h1>
        <p className="text-gray-500 text-sm mb-6">
          Step {step} of 4 — {step === 1 ? 'Choose your companion' : step === 2 ? 'Create your avatar' : step === 3 ? 'Your story' : 'Confirm'}
        </p>

        <div className="w-full bg-gray-800 rounded-full h-1 mb-8">
          <div
            className="bg-red-600 h-1 rounded-full transition-all duration-500"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        {errorMessage && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <h2 className="text-xl font-bold">Choose your companion</h2>

            <div className="flex gap-2">
              <Pill label="Pick from roster" active={companionMode === 'roster'} onClick={() => setCompanionMode('roster')} />
              <Pill label="Build your own" active={companionMode === 'custom'} onClick={() => setCompanionMode('custom')} />
            </div>

            {companionMode === 'roster' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {archetypes.map((archetype) => (
                  <button
                    key={archetype.id}
                    type="button"
                    onClick={() => setSelectedArchetypeId(archetype.id)}
                    className={`text-left p-4 rounded-xl border transition ${selectedArchetypeId === archetype.id ? 'border-red-500 bg-red-950/20' : 'border-gray-700 hover:border-gray-500'}`}
                  >
                    <div className="font-bold">{archetype.name}</div>
                    <div className="text-xs text-red-400 mb-1">{archetype.archetype}</div>
                    <div className="text-xs text-gray-500 line-clamp-2">{archetype.tagline}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <Field label="Companion name">
                  <input
                    type="text"
                    value={companionName}
                    onChange={(event) => setCompanionName(event.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-red-500 outline-none transition"
                    placeholder="AlyraX"
                  />
                </Field>

                <div className="border border-gray-800 bg-black/40 rounded-xl p-4">
                  <label className="text-xs uppercase text-gray-500 tracking-widest mb-2 block">
                    Inspiration Image
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer border border-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm hover:border-gray-500 transition">
                      Choose Image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={uploadInspirationImage}
                        className="hidden"
                      />
                    </label>
                    <span className="text-xs text-gray-500">
                      {inspirationStatus || 'Used for loose inspiration only'}
                    </span>
                  </div>
                  {inspirationImageUrl && (
                    <img
                      src={inspirationImageUrl}
                      alt="Inspiration"
                      className="mt-3 h-24 w-20 object-cover rounded-lg border border-gray-700"
                    />
                  )}
                </div>

                <Field label="Body Type">
                  <div className="flex flex-wrap gap-2">
                    {BODY_TYPES.map((option) => <Pill key={option} label={option} active={bodyType === option} onClick={() => setBodyType(option)} />)}
                  </div>
                </Field>

                <Field label="Ethnicity">
                  <div className="flex flex-wrap gap-2">
                    {ETHNICITIES.map((option) => <Pill key={option} label={option} active={ethnicity === option} onClick={() => setEthnicity(option)} />)}
                  </div>
                </Field>

                <Field label="Hair Color">
                  <div className="flex flex-wrap gap-2">
                    {HAIR_COLORS.map((option) => <Pill key={option} label={option} active={hairColor === option} onClick={() => setHairColor(option)} />)}
                  </div>
                </Field>

                <Field label="Hair Style">
                  <div className="flex flex-wrap gap-2">
                    {HAIR_STYLES.map((option) => <Pill key={option} label={option} active={hairStyle === option} onClick={() => setHairStyle(option)} />)}
                  </div>
                </Field>

                <Field label="Eye Color">
                  <div className="flex flex-wrap gap-2">
                    {EYE_COLORS.map((option) => <Pill key={option} label={option} active={eyeColor === option} onClick={() => setEyeColor(option)} />)}
                  </div>
                </Field>

                <Field label="Her Vibe">
                  <div className="flex flex-wrap gap-2">
                    {VIBES.map((option) => <Pill key={option} label={option} active={vibe === option} onClick={() => setVibe(option)} />)}
                  </div>
                </Field>

                <Field label="Age Range">
                  <div className="flex flex-wrap gap-2">
                    {AGE_RANGES.map((option) => <Pill key={option} label={option} active={ageRange === option} onClick={() => setAgeRange(option)} />)}
                  </div>
                </Field>

                <Field label="Personality">
                  <div className="grid gap-3">
                    {PERSONAS.map((persona, index) => (
                      <button
                        key={persona.name}
                        type="button"
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
                  </div>
                </Field>

                <Field label="Anything else? (optional)">
                  <textarea
                    className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-sm focus:border-red-500 outline-none transition"
                    rows={2}
                    placeholder="e.g. tall, confident posture, tattoos, natural makeup..."
                    value={freeText}
                    onChange={(event) => setFreeText(event.target.value)}
                  />
                </Field>

                <button
                  type="button"
                  onClick={() => generateCustomCompanionImage().catch((error) => {
                    console.error('Generation failed:', error);
                    setErrorMessage(error instanceof Error ? error.message : 'Generation failed');
                  })}
                  disabled={generating}
                  className="w-full border border-yellow-500/40 text-yellow-500 py-3 rounded-xl font-bold hover:bg-yellow-500 hover:text-black transition disabled:opacity-50"
                >
                  {generating ? 'Creating preview...' : generatedImage ? 'Regenerate custom preview' : 'Preview custom companion'}
                </button>

                {generatedImage && (
                  <img
                    src={generatedImage}
                    alt="Custom companion preview"
                    className="w-40 h-52 object-contain rounded-2xl border border-gray-700 bg-black self-center"
                  />
                )}
              </div>
            )}

            <button
              type="button"
              disabled={!canAdvanceFromStep1}
              onClick={() => setStep(2)}
              className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition disabled:opacity-50"
            >
              Next — Create your avatar
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            <h2 className="text-xl font-bold">Create your avatar — this is you</h2>
            <p className="text-sm text-gray-400">You’ll appear next to your companion on dates and trips. Make it feel like you.</p>

            <Field label="Gender / presentation">
              <div className="flex flex-wrap gap-2">
                {AVATAR_GENDERS.map((option) => <Pill key={option} label={option} active={avGender === option} onClick={() => setAvGender(option)} />)}
              </div>
            </Field>

            <Field label="Body type">
              <div className="flex flex-wrap gap-2">
                {BODY_TYPES.map((option) => <Pill key={option} label={option} active={avBodyType === option} onClick={() => setAvBodyType(option)} />)}
              </div>
            </Field>

            <Field label="Skin tone">
              <div className="flex flex-wrap gap-2">
                {SKIN_TONES.map((option) => <Pill key={option} label={option} active={avSkinTone === option} onClick={() => setAvSkinTone(option)} />)}
              </div>
            </Field>

            <Field label="Hair color">
              <div className="flex flex-wrap gap-2">
                {HAIR_COLORS.map((option) => <Pill key={option} label={option} active={avHairColor === option} onClick={() => setAvHairColor(option)} />)}
              </div>
            </Field>

            <Field label="Hair style">
              <div className="flex flex-wrap gap-2">
                {HAIR_STYLES.map((option) => <Pill key={option} label={option} active={avHairStyle === option} onClick={() => setAvHairStyle(option)} />)}
              </div>
            </Field>

            <Field label="Style">
              <div className="flex flex-wrap gap-2">
                {AVATAR_STYLES.map((option) => <Pill key={option} label={option} active={avStyle === option} onClick={() => setAvStyle(option)} />)}
              </div>
            </Field>

            <Field label="Anything else? (optional)">
              <textarea
                className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-sm focus:border-red-500 outline-none transition"
                rows={2}
                value={avFreeText}
                onChange={(event) => setAvFreeText(event.target.value)}
                placeholder="Glasses, beard, freckles, favorite jacket..."
              />
            </Field>

            <button
              type="button"
              disabled={avatarBusy}
              onClick={generateAvatar}
              className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition disabled:opacity-50"
            >
              {avatarBusy ? 'Creating you...' : avatarUrl ? 'Regenerate' : 'Generate your avatar'}
            </button>

            {avatarUrl && (
              <div className="flex flex-col items-center gap-3">
                <img src={avatarUrl} alt="Your avatar" className="w-48 h-64 object-contain rounded-2xl border border-gray-700 bg-black" />
                <div className="flex gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setAvatarUrl('')}
                    className="flex-1 border border-gray-700 text-gray-400 py-3 rounded-xl font-bold hover:border-gray-500 transition"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition"
                  >
                    Lock it in →
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setStep(1)}
              className="border border-gray-700 text-gray-400 py-3 rounded-xl font-bold hover:border-gray-500 transition"
            >
              Back
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5">
            <h2 className="text-xl font-bold">Your story</h2>

            <Field label="Your name">
              <input
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                placeholder="What should they know your name is?"
                className="w-full bg-black border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-red-500 outline-none transition"
              />
            </Field>

            <Field label="What they call you (optional)">
              <input
                value={companionNickname}
                onChange={(event) => setCompanionNickname(event.target.value)}
                placeholder="babe, captain, your real name..."
                className="w-full bg-black border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-red-500 outline-none transition"
              />
            </Field>

            <Field label="How you two met / your vibe (optional)">
              <textarea
                rows={3}
                value={howWeMet}
                onChange={(event) => setHowWeMet(event.target.value)}
                placeholder="We met on a rooftop in Brooklyn last summer..."
                className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-sm focus:border-red-500 outline-none transition"
              />
            </Field>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 border border-gray-700 text-gray-400 py-3 rounded-xl font-bold hover:border-gray-500 transition"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-5 items-center">
            <h2 className="text-xl font-bold">You’re all set</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              <div className="rounded-xl border border-gray-800 bg-black/40 p-4">
                <div className="text-xs uppercase text-gray-500 tracking-widest mb-2">Companion</div>
                <div className="font-bold">{companionMode === 'roster' ? selectedArchetype?.name : companionName}</div>
                <div className="text-sm text-gray-500">{companionMode === 'roster' ? selectedArchetype?.archetype : 'Custom companion'}</div>
                {generatedImage && companionMode === 'custom' && (
                  <img src={generatedImage} alt="Custom companion" className="mt-3 w-28 h-36 object-contain rounded-xl border border-gray-700 bg-black" />
                )}
              </div>

              <div className="rounded-xl border border-gray-800 bg-black/40 p-4">
                <div className="text-xs uppercase text-gray-500 tracking-widest mb-2">You</div>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Your avatar" className="w-28 h-36 object-contain rounded-xl border border-gray-700 bg-black" />
                ) : (
                  <div className="text-sm text-gray-500">Avatar locked</div>
                )}
              </div>
            </div>

            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex-1 border border-gray-700 text-gray-400 py-3 rounded-xl font-bold hover:border-gray-500 transition"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleFinish}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition disabled:opacity-50"
              >
                {saving ? 'Setting up...' : 'Enter →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
