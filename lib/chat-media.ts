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
    ? 'front-facing selfie perspective, arm-length framing, phone and camera are not visible in frame, no object blocking the subject'
    : 'requested image composition, natural photographic perspective, do not make it a selfie unless the user requested a selfie';

  if (profile) {
    if (adultSelfie) {
      return [
        `user request: ${userRequest}`,
        'follow the requested setting, pose, framing, viewpoint, and nudity level exactly',
        'preserve the exact face, skin tone, hair color, hairstyle, and identity from the reference image',
        `private adult nude image of a clearly ${profile.age}-year-old ${profile.race}`,
        profile.details,
        'unclothed, no outfit, no wardrobe, do not add clothing unless the user specifically requested clothing',
        requestedFormat,
        'raw photorealistic DSLR photograph, real human skin texture, visible pores, natural lighting, not cartoon, not illustration, not CGI',
      ].filter(Boolean).join(', ');
    }

    return [
      `user request: ${userRequest}`,
      'follow the requested setting, pose, framing, and viewpoint',
      'preserve the exact face, skin tone, hair color, hairstyle, and identity from the reference image',
      `documentary portrait photograph of a ${profile.age}-year-old ${profile.race}`,
      profile.details,
      profile.wardrobe,
      requestedFormat,
      'raw photorealistic DSLR photograph, real human skin texture, visible pores, natural lighting, not cartoon, not illustration, not CGI',
    ].filter(Boolean).join(', ');
  }

  const genderAnchor = archetype.gender === 'M'
    ? 'Black American man, dark brown skin, masculine face'
    : 'Black American woman, dark brown skin, feminine face';

  if (adultSelfie) {
    return `user request: ${userRequest}, follow the requested setting, pose, framing, viewpoint, and nudity level exactly, private adult nude image of a clearly ${archetype.age}-year-old ${genderAnchor}, unclothed, no outfit, no wardrobe, do not add clothing unless the user specifically requested clothing, ${requestedFormat}, raw photorealistic DSLR photograph, real human skin texture, visible pores, natural lighting, not cartoon, not illustration, not CGI`;
  }

  return `user request: ${userRequest}, follow the requested setting, pose, framing, and viewpoint, ${genderAnchor}, ${archetype.vibe.toLowerCase()}, ${requestedFormat}, raw photorealistic DSLR photograph, real human skin texture, visible pores, natural lighting, not cartoon, not illustration, not CGI`;
}
