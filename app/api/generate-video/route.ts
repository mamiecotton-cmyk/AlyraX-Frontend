import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { archetypes } from '@/lib/archetypes';
import { getArchetypeLora, type ArchetypeLoraConfig } from '@/lib/archetype-loras';

export const maxDuration = 300;

const ATLAS_API_KEY = process.env.ATLAS_CLOUD_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const ATLAS_MODEL = 'atlascloud/wan-2.2-turbo-spicy/infinite-image-to-video';
const OPENROUTER_MODEL = 'sao10k/l3.3-euryale-70b';
const SCENE_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    prompts: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: { type: 'string' },
    },
    continuityState: {
      type: 'string',
      enum: ['start', 'middle', 'complete'],
    },
    onWait1: { type: 'string' },
    onWait2: { type: 'string' },
    onMid: { type: 'string' },
  },
  required: ['prompts', 'continuityState', 'onWait1', 'onWait2', 'onMid'],
  additionalProperties: false,
};

type WardrobeState = 'clothed' | 'partial' | 'nude';

type VideoScenePlan = {
  prompts: string[];
  onWait1: string;
  onWait2: string;
  onMid: string;
  endWardrobeState: WardrobeState;
};

type CompanionPersona = {
  name?: string | null;
};

type ConversationMessage = {
  role: string;
  content: string;
};

type CharacterGender = 'M' | 'F' | 'unknown';

type ImageDimensions = {
  width: number;
  height: number;
};

type FluxImageStyle = 'portrait' | 'fullbody' | 'fullscreen';

const WAN_480P_SHORT_EDGE = 480;
const WAN_480P_MAX_LONG_EDGE = 832;
const WAN_VIDEO_LENGTH = 81;
const WAN_SAMPLER_STEPS = 16;
const WAN_CFG = 4.5;

// ─── Video Provider ────────────────────────────────────────────────────────

type VideoProvider = 'runpod' | 'atlas';

function resolveRequestUrl(value: string, req: NextRequest) {
  if (!value || value.startsWith('data:')) return value;

  try {
    return new URL(value).toString();
  } catch {
    return new URL(value, req.url).toString();
  }
}

// ─── RunPod Wan2.1 I2V ────────────────────────────────────────────────────

function buildWan21Workflow(
  imageFilename: string,
  positivePrompt: string,
  negativePrompt: string,
  dimensions: ImageDimensions,
): Record<string, unknown> {
  return {
    '37': {
      inputs: {
        unet_name: 'wan2.1_i2v_480p_14B_fp16.safetensors',
        weight_dtype: 'default',
      },
      class_type: 'UNETLoader',
    },
    '38': {
      inputs: {
        clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        type: 'wan',
        device: 'default',
      },
      class_type: 'CLIPLoader',
    },
    '39': {
      inputs: { vae_name: 'wan_2.1_vae.safetensors' },
      class_type: 'VAELoader',
    },
    '49': {
      inputs: { clip_name: 'clip_vision_h.safetensors' },
      class_type: 'CLIPVisionLoader',
    },
    '52': {
      inputs: {
        image: imageFilename,
        upload: 'image',
      },
      class_type: 'LoadImage',
    },
    '6': {
      inputs: {
        text: positivePrompt,
        clip: ['38', 0],
      },
      class_type: 'CLIPTextEncode',
    },
    '7': {
      inputs: {
        text: negativePrompt,
        clip: ['38', 0],
      },
      class_type: 'CLIPTextEncode',
    },
    '51': {
      inputs: {
        clip_vision: ['49', 0],
        image: ['52', 0],
        crop: 'none',
      },
      class_type: 'CLIPVisionEncode',
    },
    '50': {
      inputs: {
        positive: ['6', 0],
        negative: ['7', 0],
        vae: ['39', 0],
        clip_vision_output: ['51', 0],
        start_image: ['52', 0],
        width: dimensions.width,
        height: dimensions.height,
        length: WAN_VIDEO_LENGTH,
        batch_size: 1,
      },
      class_type: 'WanImageToVideo',
    },
    '54': {
      inputs: {
        model: ['37', 0],
        shift: 5,
      },
      class_type: 'ModelSamplingSD3',
    },
    '3': {
      inputs: {
        seed: Math.floor(Math.random() * 2 ** 32),
        steps: WAN_SAMPLER_STEPS,
        cfg: WAN_CFG,
        sampler_name: 'uni_pc',
        scheduler: 'simple',
        denoise: 1,
        model: ['54', 0],
        positive: ['50', 0],
        negative: ['50', 1],
        latent_image: ['50', 2],
      },
      class_type: 'KSampler',
    },
    '8': {
      inputs: {
        samples: ['3', 0],
        vae: ['39', 0],
      },
      class_type: 'VAEDecode',
    },
    '28': {
      inputs: {
        images: ['8', 0],
        filename_prefix: 'alyrax_video',
        fps: 16,
        lossless: false,
        quality: 90,
        method: 'default',
      },
      class_type: 'SaveAnimatedWEBP',
    },
  };
}

function roundToMultiple(value: number, multiple: number) {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

function getPngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function getJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }

  return null;
}

function getWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;

  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }

  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunk === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return null;
}

function getImageDimensions(buffer: Buffer): ImageDimensions | null {
  return getPngDimensions(buffer) || getJpegDimensions(buffer) || getWebpDimensions(buffer);
}

function getVideoDimensions(source: ImageDimensions | null): ImageDimensions {
  if (!source?.width || !source?.height) {
    return { width: WAN_480P_SHORT_EDGE, height: WAN_480P_MAX_LONG_EDGE };
  }

  const aspect = source.width / source.height;

  if (aspect >= 1) {
    const uncappedWidth = roundToMultiple(WAN_480P_SHORT_EDGE * aspect, 16);
    const width = Math.min(WAN_480P_MAX_LONG_EDGE, Math.max(WAN_480P_SHORT_EDGE, uncappedWidth));
    const height = width === uncappedWidth
      ? WAN_480P_SHORT_EDGE
      : Math.max(WAN_480P_SHORT_EDGE, roundToMultiple(width / aspect, 16));
    return { width, height };
  }

  const uncappedHeight = roundToMultiple(WAN_480P_SHORT_EDGE / aspect, 16);
  const height = Math.min(WAN_480P_MAX_LONG_EDGE, Math.max(WAN_480P_SHORT_EDGE, uncappedHeight));
  const width = height === uncappedHeight
    ? WAN_480P_SHORT_EDGE
    : Math.max(16, roundToMultiple(height * aspect, 16));

  return { width, height };
}

function styleForVideoSourcePrompt(prompt: string): FluxImageStyle {
  return /\b(full body|full-body|fullbody|full length|full-length|head to toe|head-to-toe|entire body|whole body|body shot|outfit|fit check|legs?|standing|walking|dancing|dance)\b/i.test(prompt)
    ? 'fullbody'
    : 'portrait';
}

async function waitForGeneratedImage(origin: string, jobId: string, requestId: string) {
  for (let attempt = 0; attempt < 75; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const statusRes = await fetch(`${origin}/api/generate-companion/status/${jobId}`);
    const statusData = await statusRes.json().catch(() => ({}));

    if (!statusRes.ok) {
      throw new Error(statusData.error || 'Flux source frame generation failed');
    }

    if (typeof statusData.image_url === 'string') {
      return statusData.image_url;
    }
  }

  throw new Error(`[${requestId}] Flux source frame generation timed out`);
}

async function generateFluxSourceFrame({
  origin,
  requestId,
  prompt,
  loraConfig,
  characterId,
}: {
  origin: string;
  requestId: string;
  prompt: string;
  loraConfig: ArchetypeLoraConfig;
  characterId?: string;
}) {
  const fluxRes = await fetch(`${origin}/api/generate-flux-selfie`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      lora_file: loraConfig.loraFile,
      trigger_word: loraConfig.triggerWord,
      style: styleForVideoSourcePrompt(prompt) === 'fullbody' ? 'fullbody' : 'fullscreen',
      character_id: characterId,
    }),
  });

  const fluxData = await fluxRes.json().catch(() => ({}));
  if (!fluxRes.ok || typeof fluxData.jobId !== 'string') {
    throw new Error(fluxData.error || 'Flux source frame submission failed');
  }

  console.log(`[${requestId}] Flux LoRA source frame submitted`, {
    loraFile: loraConfig.loraFile,
    jobId: fluxData.jobId,
  });

  return waitForGeneratedImage(origin, fluxData.jobId, requestId);
}

async function submitRunPodVideo(
  imageUrl: string,
  positivePrompt: string,
  negativePrompt: string,
  requestId: string,
): Promise<string | null> {
  const endpointId = process.env.RUNPOD_VIDEO_ENDPOINT_ID;
  if (!endpointId) {
    console.warn(`[${requestId}] RUNPOD_VIDEO_ENDPOINT_ID not set — skipping RunPod`);
    return null;
  }

  // Fetch companion image and convert to base64
  // The RunPod ComfyUI worker accepts images via the `images` input field
  // and saves them to /comfyui/input/ before running the workflow
  let imageBase64: string;
  let videoDimensions: ImageDimensions;
  let sourceDimensions: ImageDimensions | null = null;
  try {
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new Error(`Image fetch failed: ${imageRes.status}`);
    const imageBuffer = await imageRes.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);
    imageBase64 = buffer.toString('base64');
    sourceDimensions = getImageDimensions(buffer);
    videoDimensions = getVideoDimensions(sourceDimensions);
  } catch (err) {
    console.error(`[${requestId}] Failed to fetch companion image:`, err);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`RunPod video source image fetch failed: ${message}`);
  }

  console.log(`[${requestId}] RunPod video resolution`, {
    sourceDimensions,
    videoDimensions,
  });

  const imageFilename = 'companion_input.png';
  const workflow = buildWan21Workflow(imageFilename, positivePrompt, negativePrompt, videoDimensions);

  try {
    const res = await fetch(
      `https://api.runpod.ai/v2/${endpointId}/run`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`,
        },
        body: JSON.stringify({
          input: {
            workflow,
            images: [
              {
                name: imageFilename,
                image: imageBase64,
              },
            ],
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`[${requestId}] RunPod video submit failed (${res.status}):`, body);
      throw new Error(`RunPod video submit failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    const jobId = data?.id;

    if (!jobId) {
      console.error(`[${requestId}] RunPod returned no job ID:`, data);
      throw new Error('RunPod video submit returned no job ID');
    }

    console.log(`[${requestId}] RunPod video job submitted: ${jobId}`);
    return jobId as string;
  } catch (err) {
    console.error(`[${requestId}] RunPod video submit exception:`, err);
    throw err;
  }
}

// ─── Atlas fallback ───────────────────────────────────────────────────────

async function submitAtlasVideo(
  imageUrl: string,
  prompts: string[],
  requestId: string,
): Promise<string> {
  console.log(`[${requestId}] Atlas submit starting:`, {
    model: ATLAS_MODEL,
    imageUrl,
    promptCount: prompts.length,
  });

  const submitResponse = await fetch(
    'https://api.atlascloud.ai/api/v1/model/generateVideo',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ATLAS_API_KEY}`,
      },
      body: JSON.stringify({
        model: ATLAS_MODEL,
        image: imageUrl,
        prompt: prompts,
        duration: 5,
        resolution: '480p',
        seed: -1,
      }),
    },
  );

  if (!submitResponse.ok) {
    const error = await submitResponse.text();
    console.error(`[${requestId}] Atlas submit FAILED:`, {
      status: submitResponse.status,
      body: error,
    });
    throw new Error(`Atlas Cloud submission failed: ${error}`);
  }

  const submitData = await submitResponse.json();
  const predictionId = submitData.data?.id || submitData.id;
  if (!predictionId) throw new Error('No prediction ID returned from Atlas');
  return predictionId as string;
}

// ─── Scene planning (unchanged) ───────────────────────────────────────────

function getPersonaVoice(personaName?: string | null) {
  const n = personaName?.toLowerCase() || '';
  if (n.includes('dominant')) return 'Voice: commanding, possessive, and in control.';
  if (n.includes('submissive')) return 'Voice: breathless, eager, and devoted.';
  return 'Voice: confident, intimate, and natural.';
}

function normalizeCharacterGender(value: unknown): CharacterGender {
  if (value === 'M' || value === 'male' || value === 'man') return 'M';
  if (value === 'F' || value === 'female' || value === 'woman') return 'F';
  return 'unknown';
}

function getCharacterTerms(gender: CharacterGender) {
  if (gender === 'M') {
    return {
      noun: 'adult man',
      subject: 'he',
      object: 'him',
      possessive: 'his',
      subjectTitle: 'He',
    };
  }

  if (gender === 'F') {
    return {
      noun: 'adult woman',
      subject: 'she',
      object: 'her',
      possessive: 'her',
      subjectTitle: 'She',
    };
  }

  return {
    noun: 'adult person',
    subject: 'they',
    object: 'them',
    possessive: 'their',
    subjectTitle: 'They',
  };
}

function buildVideoNegativePrompt(gender: CharacterGender) {
  const base = [
    'static',
    'blurry',
    'low quality',
    'deformed',
    'ugly',
    'bad anatomy',
    'warped body',
    'stretched body',
    'rubber body',
    'liquified body',
    'distorted face',
    'melting face',
    'wobbly face',
    'face smear',
    'face morphing',
    'identity drift',
    'temporal inconsistency',
    'inconsistent face',
    'jitter',
    'camera shake',
    'warped hands',
    'extra fingers',
    'missing fingers',
    'fused fingers',
    'warped feet',
    'extra toes',
    'missing toes',
    'fused toes',
    'extra limbs',
    'missing limbs',
    'rubber limbs',
    'twisted limbs',
    'mutated hands',
    'body transformation',
    'identity change',
    'wrong ethnicity',
    'different person',
    'watermark',
    'text',
  ];

  if (gender === 'M') {
    base.push('woman', 'female', 'girl', 'feminine face', 'breasts', 'long hair', 'makeup', 'dress', 'gender swap');
  } else if (gender === 'F') {
    base.push('man', 'male', 'masculine face', 'beard', 'mustache', 'broad male shoulders', 'gender swap');
  }

  // Anatomy repetition — Wan2.1 responds to weighted repetition for body parts
  base.push(
    'warped hands', 'warped hands', 'extra fingers', 'extra fingers', 'missing fingers', 'missing fingers', 'fused fingers', 'fused fingers',
    'warped feet', 'warped feet', 'extra toes', 'extra toes', 'missing toes', 'fused toes',
    'warped limbs', 'rubber limbs', 'twisted limbs', 'melting body', 'liquified limbs',
  );

  return base.join(', ');
}

function buildWanPositivePrompt(scenePrompt: string) {
  return [
    scenePrompt,
    'stable image-to-video animation',
    'preserve the exact face and identity from the source image',
    'preserve source image body proportions and anatomy',
    'subtle realistic motion',
    'stable camera',
    'natural human movement',
  ].join(', ');
}

function normalizeWardrobeState(value: unknown): WardrobeState {
  if (value === 'partial' || value === 'nude') return value;
  return 'clothed';
}

function inferWardrobeStateFromPrompt(prompt: unknown, fallback: WardrobeState): WardrobeState {
  if (typeof prompt !== 'string') return fallback;

  const normalized = prompt.toLowerCase();

  if (/\b(nude|naked|unclothed|not clothed|no clothes|no clothing|without clothes|clothes off|fully bare)\b/.test(normalized)) {
    return 'nude';
  }

  if (/\b(undress|undressing|taking off|take off|removing clothes|partially clothed|partially dressed|shirtless|topless|lingerie|underwear)\b/.test(normalized)) {
    return 'partial';
  }

  return fallback;
}

function clampEndWardrobeState(value: unknown, fallback: WardrobeState): WardrobeState {
  if (value === 'clothed' || value === 'partial' || value === 'nude') return value;
  if (value === 'start') return 'clothed';
  if (value === 'middle') return 'partial';
  if (value === 'complete') return 'nude';
  return fallback;
}

function sanitizePrompts(prompts: string[]): string[] {
  return prompts
    .map((prompt) => prompt.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 6);
}

function extractJsonObject(content: string): Record<string, unknown> | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseScenePlan(
  content: string,
  wardrobeState: WardrobeState,
): VideoScenePlan | null {
  const parsed = extractJsonObject(content);
  if (!parsed) return null;

  const rawPrompts = Array.isArray(parsed.prompts)
    ? parsed.prompts.filter((p): p is string => typeof p === 'string')
    : [];
  const prompts = sanitizePrompts(rawPrompts);
  if (prompts.length < 3 || prompts.length > 6) return null;

  const onWait1 =
    typeof parsed.onWait1 === 'string' && parsed.onWait1.trim()
      ? parsed.onWait1.trim()
      : '';
  const onWait2 =
    typeof parsed.onWait2 === 'string' && parsed.onWait2.trim()
      ? parsed.onWait2.trim()
      : '';
  const onMid =
    typeof parsed.onMid === 'string' && parsed.onMid.trim()
      ? parsed.onMid.trim()
      : '';

  return {
    prompts,
    onWait1,
    onWait2,
    onMid,
    endWardrobeState: clampEndWardrobeState(parsed.continuityState, wardrobeState),
  };
}

async function askEuryaleForScenePlan(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  wardrobeState: WardrobeState,
  characterGender: CharacterGender,
  characterName?: string | null,
  personaName?: string | null,
  retryReason?: string,
): Promise<string | null> {
  if (!OPENROUTER_API_KEY) return null;

  const terms = getCharacterTerms(characterGender);
  const characterLine = characterName
    ? `The character is ${characterName}, a consenting ${terms.noun}. Use ${terms.subject}/${terms.object}/${terms.possessive} pronouns.`
    : `The character is a consenting ${terms.noun}. Use ${terms.subject}/${terms.object}/${terms.possessive} pronouns.`;
  const recentHistory = conversationHistory.slice(-12);
  const continuityInstruction =
    wardrobeState === 'nude'
      ? 'Internal continuity state: complete. The latest request explicitly asks for no clothing; do not add new wardrobe. Let the anchor image define the visible starting point and preserve visual continuity.'
      : wardrobeState === 'partial'
        ? 'Internal continuity state: middle. The latest request implies a partially dressed or changing wardrobe state; do not reset to fully clothed unless the user asks. Let the anchor image define the visible starting point and continue the narrated action naturally.'
        : 'Internal continuity state: start. Let the anchor image define the visible starting point and begin the narrated action naturally.';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://alyra-x-frontend.vercel.app',
      'X-Title': 'AlyraX',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: 650,
      temperature: 0.45,
      stream: false,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'video_scene_plan',
          strict: true,
          schema: SCENE_PLAN_SCHEMA,
        },
      },
      messages: [
        {
          role: 'system',
          content: `You write image-to-video prompts for a consenting adult character.

Base the next clip on the user's latest request, the companion's latest narrated audio transcript, the last 6 conversation exchanges, and the anchor image.
${characterLine}
${continuityInstruction}
${retryReason ? `Regenerate because the previous draft failed validation: ${retryReason}` : ''}

You are a JSON scene planner, not the companion. Do not answer as dialogue. Do not write a sentence to the user.
Movement license: ${terms.subject} can shift, turn, walk, change framing, move closer or farther, and adjust the camera relationship naturally.
Prefer subtle realistic motion, stable camera movement, small expression changes, and gentle body movement unless the user explicitly asks for large movement. Avoid fast motion, extreme turns, complex hand motion, and body twisting.
Preserve the anchor image identity, face, race, gender presentation, body type, proportions, and source-frame aspect. Do not stretch the body, feminize, masculinize, change anatomy, change race, or turn ${terms.object} into a different person.
Do not use identity boilerplate. Do not write "same adult woman in source image". Do not lock the pose or require exact pose matching.
Prompts should be visual motion beats only, 3-6 strings, max 24 words each, no location changes. Let the video model infer visible details from the anchor image.
Describe actions, motion, framing, expression, and camera relationship without labeling the visible state.
Return continuityState as "start", "middle", or "complete" so the next clip can continue internally.
Spoken lines are first person, present tense, concise, and matched to the user's request.
${getPersonaVoice(personaName)}

Return ONLY valid JSON:
{"prompts":["p1","p2","p3"],"continuityState":"middle","onWait1":"1-2 sentences max 40 words","onWait2":"1-2 sentences max 40 words","onMid":"1 sentence max 15 words"}`,
        },
        ...recentHistory,
        {
          role: 'user',
          content: userMessage || 'Continue the scene naturally.',
        },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('OpenRouter HTTP error:', {
      status: response.status,
      error: data?.error || data,
    });
    return null;
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    console.error('OpenRouter returned 200 but no content');
    return null;
  }

  return content.trim();
}

async function generateVideoScenePlan(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  wardrobeState: WardrobeState,
  characterGender: CharacterGender,
  characterName?: string | null,
  personaName?: string | null,
  requestId?: string,
  trace?: string[],
): Promise<VideoScenePlan> {
  const tag = requestId ? `[${requestId}]` : '';
  let retryReason: string | undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      trace?.push(`euryale-attempt-${attempt + 1}`);
      const content = await askEuryaleForScenePlan(
        userMessage,
        conversationHistory,
        wardrobeState,
        characterGender,
        characterName,
        personaName,
        retryReason,
      );

      if (!content) {
        retryReason = 'provider returned no message content';
        trace?.push('euryale-empty-response');
        continue;
      }

      const parsedJson = extractJsonObject(content);
      if (!parsedJson) {
        retryReason = 'response was not valid JSON';
        trace?.push('json-parse-failed');
        continue;
      }

      const rawPrompts = Array.isArray(parsedJson?.prompts)
        ? parsedJson.prompts.filter((p): p is string => typeof p === 'string')
        : [];

      if (rawPrompts.length < 3 || rawPrompts.length > 6) {
        retryReason = `prompt count was ${rawPrompts.length}, expected 3-6`;
        trace?.push('bad-prompt-count');
        continue;
      }

      trace?.push(`euryale-success-attempt-${attempt + 1}`);
      const plan = parseScenePlan(content, wardrobeState);
      if (plan) return plan;

      retryReason = 'accepted plan failed final parsing';
    } catch (error) {
      console.error(`${tag} euryale exception on attempt ${attempt + 1}:`, error);
      retryReason = 'provider error';
    }
  }

  throw new Error('Scene planning failed');
}

// ─── Main handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const requestId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const trace: string[] = [];
  const t0 = Date.now();

  try {
    const {
      userId,
      companionId,
      userMessage,
      conversationHistory,
      frameUrl,
      archetypeId: requestedArchetypeId,
      wardrobeState: requestedWardrobeState,
      characterGender: requestedCharacterGender,
      characterName: requestedCharacterName,
    } = await req.json();

    const wardrobeState = inferWardrobeStateFromPrompt(userMessage, normalizeWardrobeState(requestedWardrobeState));
    let characterGender = normalizeCharacterGender(requestedCharacterGender);
    const characterName = typeof requestedCharacterName === 'string' ? requestedCharacterName : null;

    console.log(`[${requestId}] === VIDEO REQUEST START ===`, {
      hasUserId: Boolean(userId),
      companionId: companionId || null,
      userMessage,
      hasFrameUrl: Boolean(frameUrl),
      wardrobeState,
      historyCount: Array.isArray(conversationHistory) ? conversationHistory.length : 0,
    });

    if (!userId || !userMessage) {
      return NextResponse.json({ error: 'Missing userId or userMessage' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const activeCompanionId = companionId || user?.user_metadata?.active_companion_id;

    let companionQuery = supabase
      .from('companions')
      .select('image_url, name, archetype_id, personas(name)')
      .eq('user_id', userId);

    if (activeCompanionId) {
      companionQuery = companionQuery.eq('id', activeCompanionId);
    }

    const { data: companion, error } = await companionQuery.limit(1).maybeSingle();

    const requestedArchetype = typeof requestedArchetypeId === 'string'
      ? archetypes.find((archetype) => archetype.id === requestedArchetypeId)
      : undefined;
    const companionArchetype = requestedArchetype
      ?? archetypes.find((archetype) => archetype.id === companion?.archetype_id);
    const loraArchetypeId = typeof requestedArchetypeId === 'string'
      ? requestedArchetypeId
      : companion?.archetype_id;
    const loraConfig = typeof loraArchetypeId === 'string' ? getArchetypeLora(loraArchetypeId) : null;

    if (error || (!frameUrl && !companion?.image_url && !loraConfig)) {
      return NextResponse.json({ error: 'Companion image not found' }, { status: 404 });
    }

    let imageUrl = resolveRequestUrl(frameUrl || companion?.image_url || '', req);
    const shouldGenerateWardrobeSourceFrame = Boolean(loraConfig && wardrobeState !== 'clothed');
    if (loraConfig && (!imageUrl || shouldGenerateWardrobeSourceFrame)) {
      trace.push('flux-lora-source-frame');
      imageUrl = await generateFluxSourceFrame({
        origin: new URL(req.url).origin,
        requestId,
        prompt: userMessage,
        loraConfig,
        characterId: loraArchetypeId,
      });
      console.log(`[${requestId}] using Flux LoRA source frame for video`, {
        archetypeId: loraArchetypeId,
        reason: shouldGenerateWardrobeSourceFrame ? 'prompt-wardrobe' : 'missing-source-frame',
        imageUrl,
      });
    } else if (loraConfig) {
      trace.push('preserve-existing-lora-frame');
      console.log(`[${requestId}] preserving selected source frame for LoRA video`, {
        archetypeId: loraArchetypeId,
        source: frameUrl ? 'request-frame' : 'companion-image',
      });
    }
    if (characterGender === 'unknown') {
      characterGender = normalizeCharacterGender(companionArchetype?.gender);
    }
    const persona = Array.isArray(companion?.personas)
      ? companion.personas[0]
      : (companion?.personas as CompanionPersona | null | undefined);
    const effectiveCharacterName = characterName || companion?.name || companionArchetype?.name || null;

    // Generate scene plan (same for both providers)
    const scenePlan = await generateVideoScenePlan(
      userMessage || '',
      Array.isArray(conversationHistory) ? conversationHistory : [],
      wardrobeState,
      characterGender,
      effectiveCharacterName,
      persona?.name,
      requestId,
      trace,
    );

    console.log(`[${requestId}] scene plan ready:`, {
      promptCount: scenePlan.prompts.length,
      endWardrobeState: scenePlan.endWardrobeState,
      trace: trace.join(' → '),
      elapsedMs: Date.now() - t0,
    });

    // Build a single combined prompt for Wan2.1 (join scene prompts)
    const wan21Prompt = buildWanPositivePrompt(scenePlan.prompts.join(', '));
    const negativePrompt = buildVideoNegativePrompt(characterGender);

    // ── Try RunPod Wan2.1 first ──
    let provider: VideoProvider = 'runpod';
    let predictionId: string | null = null;

    if (process.env.RUNPOD_VIDEO_ENDPOINT_ID) {
      trace.push('runpod-attempt');
      console.log(`[${requestId}] RUNPOD_VIDEO_ENDPOINT_ID=${process.env.RUNPOD_VIDEO_ENDPOINT_ID} imageUrl=${imageUrl}`);
      predictionId = await submitRunPodVideo(imageUrl, wan21Prompt, negativePrompt, requestId);
      console.log(`[${requestId}] RunPod predictionId=${predictionId}`);
    }

    // ── Fall back to Atlas only when RunPod is not configured ──
    if (!predictionId) {
      console.warn(`[${requestId}] RunPod unavailable — falling back to Atlas`);
      trace.push('atlas-fallback');
      provider = 'atlas';

      if (!ATLAS_API_KEY) {
        return NextResponse.json(
          { error: 'No video provider available' },
          { status: 500 },
        );
      }

      predictionId = await submitAtlasVideo(imageUrl, scenePlan.prompts, requestId);
    }

    console.log(
      `[${requestId}] === VIDEO REQUEST END === provider=${provider} predictionId=${predictionId} totalMs=${Date.now() - t0}`,
    );

    return NextResponse.json({
      success: true,
      prediction_id: predictionId,
      provider,
      source_frame_url: imageUrl || null,
      endWardrobeState: scenePlan.endWardrobeState,
      onWait1: scenePlan.onWait1,
      onWait2: scenePlan.onWait2,
      onMid: scenePlan.onMid,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video generation failed';
    console.error(`[${requestId}] === VIDEO REQUEST FAILED ===`, {
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      trace: trace.join(' → '),
      elapsedMs: Date.now() - t0,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
