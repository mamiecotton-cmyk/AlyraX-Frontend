import { type Archetype } from '@/lib/archetypes';
import { getArchetypeImagePrompt } from '@/lib/archetype-image-prompts';

// Detect if user is requesting an image/photo.
export function isSelfieRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\b(selfie|pic|picture|photo|image|portrait|shot|snap)\b/.test(lower)
    || /\b(send|show|take|make|create)\s+(me\s+)?(a\s+|an\s+|some\s+)?(selfie|pic|picture|photo|image|portrait|shot|snap)\b/.test(lower)
    || /\bwhat (are|do) you look(ing)?\b/.test(lower)
    || /\bwhat('re| are) you wearing\b/.test(lower)
  );
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

function isExplicitSelfieRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return /\b(selfie|snap|mirror selfie|phone selfie)\b/.test(lower);
}

// Build image prompt from user message + archetype.
export function buildSelfiePrompt(message: string, archetype: Archetype): string {
  const profile = getArchetypeImagePrompt(archetype);
  const adultSelfie = isAdultSelfieRequest(message);
  const explicitSelfie = isExplicitSelfieRequest(message);
  const userRequest = message.trim();
  const requestedFormat = explicitSelfie
    ? 'phone selfie angle, casual private moment'
    : 'requested image composition, natural camera perspective, do not make it a selfie unless the user requested a selfie';

  if (profile) {
    if (adultSelfie) {
      return [
        `user request: ${userRequest}`,
        'follow the requested setting, pose, framing, camera angle, and nudity level exactly',
        `private adult nude image of a clearly ${profile.age}-year-old ${profile.race}`,
        profile.details,
        'unclothed, no outfit, no wardrobe, do not add clothing unless the user specifically requested clothing',
        requestedFormat,
        'photorealistic DSLR, natural skin texture, soft cinematic light',
      ].filter(Boolean).join(', ');
    }

    return [
      `user request: ${userRequest}`,
      'follow the requested setting, pose, framing, and camera angle',
      `documentary portrait photograph of a ${profile.age}-year-old ${profile.race}`,
      profile.details,
      profile.wardrobe,
      requestedFormat,
      'photorealistic DSLR, natural skin texture, soft cinematic light',
    ].filter(Boolean).join(', ');
  }

  const genderAnchor = archetype.gender === 'M'
    ? 'Black American man, dark brown skin, masculine face'
    : 'Black American woman, dark brown skin, feminine face';

  if (adultSelfie) {
    return `user request: ${userRequest}, follow the requested setting, pose, framing, camera angle, and nudity level exactly, private adult nude image of a clearly ${archetype.age}-year-old ${genderAnchor}, unclothed, no outfit, no wardrobe, do not add clothing unless the user specifically requested clothing, ${requestedFormat}, photorealistic, natural skin`;
  }

  return `user request: ${userRequest}, follow the requested setting, pose, framing, and camera angle, ${genderAnchor}, ${archetype.vibe.toLowerCase()}, ${requestedFormat}, photorealistic, natural skin`;
}
