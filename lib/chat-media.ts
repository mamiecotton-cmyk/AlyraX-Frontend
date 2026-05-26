import { type Archetype } from '@/lib/archetypes';
import { getArchetypeImagePrompt } from '@/lib/archetype-image-prompts';

// Detect if user is requesting a selfie/photo.
export function isSelfieRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return /\b(selfie|pic|picture|photo|send me|show me|take a|snap|what (are|do) you look(ing)?|what('re| are) you wearing)\b/.test(lower);
}

// Detect if user is requesting a video.
export function isVideoRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return /\b(video|clip|move|show me moving|animate|come alive|walk|dance)\b/.test(lower);
}

function isAdultSelfieRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return /\b(nude|naked|uncensored|nsfw|adult|explicit|topless|shirtless|bare|intimate)\b/.test(lower);
}

// Build selfie image prompt from user message + archetype.
export function buildSelfiePrompt(message: string, archetype: Archetype): string {
  const profile = getArchetypeImagePrompt(archetype);
  const adultSelfie = isAdultSelfieRequest(message);

  if (profile) {
    if (adultSelfie) {
      return [
        `private adult nude selfie of a clearly ${profile.age}-year-old ${profile.race}`,
        profile.details,
        'unclothed, no outfit, no wardrobe, intimate private bedroom or bathroom mirror setting',
        'phone selfie angle, casual private moment, mirror selfie',
        message,
        'photorealistic DSLR, natural skin texture, soft cinematic light',
      ].filter(Boolean).join(', ');
    }

    return [
      `documentary portrait photograph of a ${profile.age}-year-old ${profile.race}`,
      profile.details,
      profile.wardrobe,
      'phone selfie angle, casual moment, mirror selfie',
      message,
      'photorealistic DSLR, natural skin texture, soft cinematic light',
    ].filter(Boolean).join(', ');
  }

  const genderAnchor = archetype.gender === 'M'
    ? 'Black American man, dark brown skin, masculine face'
    : 'Black American woman, dark brown skin, feminine face';

  if (adultSelfie) {
    return `private adult nude selfie of a clearly ${archetype.age}-year-old ${genderAnchor}, unclothed, no outfit, no wardrobe, intimate private bedroom or bathroom mirror setting, ${message}, photorealistic, natural skin`;
  }

  return `${genderAnchor}, ${archetype.vibe.toLowerCase()}, phone selfie, casual moment, ${message}, photorealistic, natural skin`;
}
