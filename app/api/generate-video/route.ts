import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

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

// ─── Video Provider ────────────────────────────────────────────────────────

type VideoProvider = 'runpod' | 'atlas';

// ─── RunPod Wan2.1 I2V ────────────────────────────────────────────────────

function buildWan21Workflow(
  imageFilename: string,
  positivePrompt: string,
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
        text: 'static, blurry, low quality, deformed, ugly, bad anatomy, watermark',
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
        width: 480,
        height: 832,
        length: 81,
        batch_size: 1,
      },
      class_type: 'WanImageToVideo',
    },
    '54': {
      inputs: {
        model: ['37', 0],
        shift: 8,
      },
      class_type: 'ModelSamplingSD3',
    },
    '3': {
      inputs: {
        seed: Math.floor(Math.random() * 2 ** 32),
        steps: 20,
        cfg: 6,
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

async function submitRunPodVideo(
  imageUrl: string,
  positivePrompt: string,
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
  try {
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new Error(`Image fetch failed: ${imageRes.status}`);
    const imageBuffer = await imageRes.arrayBuffer();
    imageBase64 = Buffer.from(imageBuffer).toString('base64');
  } catch (err) {
    console.error(`[${requestId}] Failed to fetch companion image:`, err);
    return null;
  }

  const imageFilename = 'companion_input.png';
  const workflow = buildWan21Workflow(imageFilename, positivePrompt);

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
      return null;
    }

    const data = await res.json();
    const jobId = data?.id;

    if (!jobId) {
      console.error(`[${requestId}] RunPod returned no job ID:`, data);
      return null;
    }

    console.log(`[${requestId}] RunPod video job submitted: ${jobId}`);
    return jobId as string;
  } catch (err) {
    console.error(`[${requestId}] RunPod video submit exception:`, err);
    return null;
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
  if (n.includes('dominant')) return 'Voice: commanding, possessive. She tells him what he is seeing.';
  if (n.includes('submissive')) return 'Voice: breathless, eager, devoted. She describes how much she loves being watched.';
  return 'Voice: sultry, confident, dirty. She narrates like she owns the room.';
}

function normalizeWardrobeState(value: unknown): WardrobeState {
  if (value === 'partial' || value === 'nude') return value;
  return 'clothed';
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
  personaName?: string | null,
  retryReason?: string,
): Promise<string | null> {
  if (!OPENROUTER_API_KEY) return null;

  const recentHistory = conversationHistory.slice(-12);
  const continuityInstruction =
    wardrobeState === 'nude'
      ? 'Internal continuity state: complete. Let the anchor image define the visible starting point and preserve visual continuity.'
      : wardrobeState === 'partial'
        ? 'Internal continuity state: middle. Let the anchor image define the visible starting point and continue the narrated action naturally.'
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
          content: `You write adult image-to-video prompts for a consenting adult character.

Base the next clip on the user's latest request, the companion's latest narrated audio transcript, the last 6 conversation exchanges, and the anchor image.
${continuityInstruction}
${retryReason ? `Regenerate because the previous draft failed validation: ${retryReason}` : ''}

You are a JSON scene planner, not the companion. Do not answer as dialogue. Do not write a sentence to the user.
Movement license: she can shift, turn, walk, change framing, move closer or farther, and adjust the camera relationship naturally.
Do not use identity boilerplate. Do not write "same adult woman in source image". Do not lock the pose or require exact pose matching.
Prompts should be visual motion beats only, 3-6 strings, max 28 words each, no location changes. Let the video model infer visible details from the anchor image.
Describe actions, motion, framing, expression, and camera relationship without labeling the visible state.
Return continuityState as "start", "middle", or "complete" so the next clip can continue internally.
Dirty talk lines are first person, present tense, concise, and matched to the user's request.
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
      wardrobeState: requestedWardrobeState,
    } = await req.json();

    const wardrobeState = normalizeWardrobeState(requestedWardrobeState);

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
      .select('image_url, personas(name)')
      .eq('user_id', userId);

    if (activeCompanionId) {
      companionQuery = companionQuery.eq('id', activeCompanionId);
    }

    const { data: companion, error } = await companionQuery.limit(1).maybeSingle();

    if (error || !companion?.image_url) {
      return NextResponse.json({ error: 'Companion image not found' }, { status: 404 });
    }

    const imageUrl = frameUrl || companion.image_url;
    const persona = Array.isArray(companion.personas)
      ? companion.personas[0]
      : (companion.personas as CompanionPersona | null);

    // Generate scene plan (same for both providers)
    const scenePlan = await generateVideoScenePlan(
      userMessage || '',
      Array.isArray(conversationHistory) ? conversationHistory : [],
      wardrobeState,
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
    const wan21Prompt = scenePlan.prompts.join(', ');

    // ── Try RunPod Wan2.1 first ──
    let provider: VideoProvider = 'runpod';
    let predictionId: string | null = null;

    if (process.env.RUNPOD_VIDEO_ENDPOINT_ID) {
      trace.push('runpod-attempt');
      console.log(`[${requestId}] RUNPOD_VIDEO_ENDPOINT_ID=${process.env.RUNPOD_VIDEO_ENDPOINT_ID} imageUrl=${imageUrl}`);
      predictionId = await submitRunPodVideo(imageUrl, wan21Prompt, requestId);
      console.log(`[${requestId}] RunPod predictionId=${predictionId}`);
    }

    // ── Fall back to Atlas if RunPod failed or not configured ──
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
      endWardrobeState: scenePlan.endWardrobeState,
      onWait1: scenePlan.onWait1,
      onWait2: scenePlan.onWait2,
      onMid: scenePlan.onMid,
    });
  } catch (error) {
    console.error(`[${requestId}] === VIDEO REQUEST FAILED ===`, {
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      trace: trace.join(' → '),
      elapsedMs: Date.now() - t0,
    });
    return NextResponse.json({ error: 'Video generation failed' }, { status: 500 });
  }
}
