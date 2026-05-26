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

// Build selfie image prompt from user message + archetype.
export function buildSelfiePrompt(message: string, archetype: Archetype): string {
  const profile = getArchetypeImagePrompt(archetype);

  const identityAnchor = profile
    ? `${profile.race}, ${profile.age} years old, ${profile.details}`
    : `${archetype.vibe.toLowerCase()}`;

  const genderAnchor = archetype.gender === 'M'
    ? 'Black American man, masculine face, male body, short hair, beard'
    : 'Black American woman, feminine face, female body';

  return `${identityAnchor}, ${genderAnchor}, phone selfie, casual moment, ${message}, photorealistic, natural skin, DSLR quality`;
}
