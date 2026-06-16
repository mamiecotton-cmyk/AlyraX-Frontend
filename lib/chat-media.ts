import { type Archetype } from '@/lib/archetypes';
import { getArchetypeImagePrompt } from '@/lib/archetype-image-prompts';
import { getArchetypeLora } from '@/lib/archetype-loras';

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

function isMirrorSelfieRequest(message: string): boolean {
  return /\b(mirror selfie|mirror pic|mirror picture|mirror photo|in the mirror|bathroom mirror)\b/i.test(message);
}

// Build image prompt from user message + archetype.
export function buildSelfiePrompt(message: string, archetype: Archetype): string {
  // For archetypes with a trained Flux LoRA, return a clean minimal prompt.
  // The LoRA handles identity — we only need scene/intent description.
  if (getArchetypeLora(archetype.id)) {
    return buildFluxSelfiePrompt(message);
  }

  const profile = getArchetypeImagePrompt(archetype);
  const adultSelfie = isAdultSelfieRequest(message);
  const explicitSelfie = isExplicitSelfieRequest(message);
  const mirrorSelfie = isMirrorSelfieRequest(message);
  const userRequest = message.trim();
  const identity = profile
    ? `clearly ${profile.age}-year-old ${profile.race}, ${profile.details}`
    : `clearly ${archetype.age}-year-old ${archetype.gender === 'M' ? 'Black American man, masculine face' : 'Black American woman, feminine face'}`;
  const perspective = mirrorSelfie
    ? 'mirror selfie perspective requested by the user'
    : explicitSelfie
      ? 'front-facing selfie perspective, not a mirror selfie, no reflection, no phone or camera visible in frame'
    : 'natural photographic perspective, not a selfie unless requested';

  if (adultSelfie) {
    return [
      `user request: ${userRequest}`,
      'follow the requested wardrobe, setting, pose, framing, camera angle, and nudity level exactly',
      `private adult nude image of a ${identity}`,
      'same race, gender, hair, face, and identity as the reference image',
      'do not use any default outfit or wardrobe; only use clothing if the user requested it',
      perspective,
      'photorealistic DSLR, natural skin texture, soft cinematic light',
    ].filter(Boolean).join(', ');
  }

  return [
    `user request: ${userRequest}`,
    'follow the requested wardrobe, setting, pose, framing, and camera angle exactly',
    `photograph of a ${identity}`,
    'same race, gender, hair, face, and identity as the reference image',
    'do not use any default outfit or wardrobe; only use clothing if the user requested it',
    perspective,
    'photorealistic DSLR, natural skin texture, soft cinematic light',
  ].filter(Boolean).join(', ');
}

function buildFluxSelfiePrompt(message: string): string {
  const userRequest = message.trim();
  const lower = message.toLowerCase();
  const mirrorSelfie = isMirrorSelfieRequest(message);
  const explicitSelfie = isExplicitSelfieRequest(message);
  const isFullBody = /\b(full body|full-body|head to toe|whole body|laying|lying|on (the )?(bed|floor|couch)|on (all fours|hands and knees)|spreading|legs (spread|open|apart))\b/.test(lower);
  const isReclining = /\b(laying|lying|reclining|laid (down|back)|on (her|his|their) back)\b/.test(lower);

  const perspective = mirrorSelfie
    ? 'mirror selfie perspective, phone visible in mirror'
    : isReclining
      ? 'reclining pose, lying down, body horizontal, full body in frame head to toe'
      : isFullBody
        ? 'full body in frame, entire body visible head to toe'
        : explicitSelfie
          ? 'phone selfie perspective, casual handheld photo'
          : 'natural candid photo';

  return [
    userRequest,
    perspective,
    'photorealistic DSLR photo, sharp focus, natural skin texture, proper anatomical proportions',
  ].filter(Boolean).join(', ');
}
