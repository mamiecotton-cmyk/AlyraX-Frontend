import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 300;

const ATLAS_API_KEY = process.env.ATLAS_CLOUD_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const ATLAS_MODEL = 'atlascloud/wan-2.2-turbo-spicy/infinite-image-to-video';
const OPENROUTER_MODEL = 'sao10k/l3.3-euryale-70b';
const NUDE_LEAK_REGEX = /\b(clothing|shirt|dress|top|panties|bra|fabric|sleeves|undressing|removes)\b/i;

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
  return fallback;
}

function sanitizePrompts(prompts: string[], wardrobeState: WardrobeState): string[] {
  const cleaned = prompts
    .map(prompt => prompt.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 6);

  if (wardrobeState !== 'nude') return cleaned;
  return cleaned.filter(prompt => !NUDE_LEAK_REGEX.test(prompt));
}

function hasNudeLeak(prompts: string[], wardrobeState: WardrobeState): boolean {
  return wardrobeState === 'nude' && prompts.some(prompt => NUDE_LEAK_REGEX.test(prompt));
}

function extractJsonObject(content: string): Record<string, unknown> | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
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
    ? parsed.prompts.filter((prompt): prompt is string => typeof prompt === 'string')
    : [];
  const prompts = sanitizePrompts(rawPrompts, wardrobeState);
  if (prompts.length < 3 || prompts.length > 6) return null;

  const onWait1 = typeof parsed.onWait1 === 'string' && parsed.onWait1.trim()
    ? parsed.onWait1.trim()
    : '';
  const onWait2 = typeof parsed.onWait2 === 'string' && parsed.onWait2.trim()
    ? parsed.onWait2.trim()
    : '';
  const onMid = typeof parsed.onMid === 'string' && parsed.onMid.trim()
    ? parsed.onMid.trim()
    : '';

  return {
    prompts,
    onWait1,
    onWait2,
    onMid,
    endWardrobeState: clampEndWardrobeState(parsed.endWardrobeState, wardrobeState),
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
  const wardrobeInstruction = wardrobeState === 'nude'
    ? 'Current wardrobe state: nude. She must remain nude. Do not mention clothing, shirt, dress, top, panties, bra, fabric, sleeves, undressing, or removes.'
    : wardrobeState === 'partial'
      ? 'Current wardrobe state: partial. Continue naturally and choose whether this clip ends partial or nude.'
      : 'Current wardrobe state: clothed. Begin the visual progression naturally and choose whether this clip ends clothed or partial.';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://alyra-x-frontend.vercel.app',
      'X-Title': 'AlyraX',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: 650,
      temperature: 0.45,
      stream: false,
      messages: [
        {
          role: 'system',
          content: `You write adult image-to-video prompts for a consenting adult character.

Base the next clip on the user's latest request, the last 6 conversation exchanges, and the current wardrobe state.
${wardrobeInstruction}
${retryReason ? `Regenerate because the previous draft failed validation: ${retryReason}` : ''}

Movement license: she can shift, turn, walk, change framing, move closer or farther, and adjust the camera relationship naturally.
Do not use identity boilerplate. Do not write "same adult woman in source image". Do not lock the pose or require exact pose matching.
Prompts should be visual motion beats only, 3-6 strings, max 28 words each, no location changes.
Return an endWardrobeState of "clothed", "partial", or "nude" so the next clip can continue from that state.
Dirty talk lines are first person, present tense, concise, and matched to the user's request.
${getPersonaVoice(personaName)}

Return ONLY valid JSON:
{"prompts":["p1","p2","p3"],"endWardrobeState":"partial","onWait1":"1-2 sentences max 40 words","onWait2":"1-2 sentences max 40 words","onMid":"1 sentence max 15 words"}`,
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
      statusText: response.statusText,
      error: data?.error || data,
      model: OPENROUTER_MODEL,
    });
    return null;
  }

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    console.error('OpenRouter returned 200 but no content:', {
      finishReason: data.choices?.[0]?.finish_reason,
      fullResponse: JSON.stringify(data).slice(0, 800),
    });
    return null;
  }

  console.log('OpenRouter success:', {
    model: OPENROUTER_MODEL,
    status: response.status,
    contentLength: content.length,
    finishReason: data.choices?.[0]?.finish_reason,
    usage: data.usage,
  });

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
      console.log(`${tag} euryale attempt ${attempt + 1}/3${retryReason ? ` (retry: ${retryReason})` : ''}`);

      const content = await askEuryaleForScenePlan(
        userMessage,
        conversationHistory,
        wardrobeState,
        personaName,
        retryReason,
      );

      if (!content) {
        retryReason = 'provider returned no message content';
        console.warn(`${tag} euryale returned no content (attempt ${attempt + 1}) — retrying`);
        trace?.push('euryale-empty-response');
        continue;
      }

      console.log(`${tag} euryale raw response (${content.length} chars):`, content.slice(0, 400));

      const parsedJson = extractJsonObject(content);
      if (!parsedJson) {
        console.warn(`${tag} euryale response did not contain parseable JSON`);
        trace?.push('json-parse-failed');
        retryReason = 'response was not valid JSON';
        continue;
      }

      const rawPrompts = Array.isArray(parsedJson?.prompts)
        ? parsedJson.prompts.filter((prompt): prompt is string => typeof prompt === 'string')
        : [];

      if (hasNudeLeak(rawPrompts, wardrobeState)) {
        retryReason = 'nude prompt contained a banned wardrobe word';
        console.warn(`${tag} validation failed: ${retryReason}`);
        trace?.push('nude-leak-detected');
        continue;
      }

      if (rawPrompts.length < 3 || rawPrompts.length > 6) {
        retryReason = `prompt count was ${rawPrompts.length}, expected 3-6`;
        console.warn(`${tag} validation failed: ${retryReason}`);
        trace?.push('bad-prompt-count');
        continue;
      }

      console.log(`${tag} euryale plan accepted on attempt ${attempt + 1}`);
      trace?.push(`euryale-success-attempt-${attempt + 1}`);
      const plan = parseScenePlan(content, wardrobeState);
      if (plan) return plan;

      trace?.push('accepted-plan-parse-failed');
      retryReason = 'accepted plan failed final parsing';
    } catch (error) {
      console.error(`${tag} euryale exception on attempt ${attempt + 1}:`, error);
      trace?.push(`euryale-exception-attempt-${attempt + 1}`);
      retryReason = 'provider error';
    }
  }

  console.warn(`${tag} scene planning failed after all attempts; no fallback prompts will be submitted`);
  trace?.push('scene-plan-failed-no-fallback');
  throw new Error('Scene planning failed');
}

async function submitAtlasVideo(imageUrl: string, prompts: string[], requestId?: string): Promise<string> {
  const tag = requestId ? `[${requestId}]` : '';
  console.log(`${tag} Atlas submit starting:`, {
    model: ATLAS_MODEL,
    imageUrl,
    promptCount: prompts.length,
    prompts,
  });

  const submitResponse = await fetch(
    'https://api.atlascloud.ai/api/v1/model/generateVideo',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ATLAS_API_KEY}`,
      },
      body: JSON.stringify({
        model: ATLAS_MODEL,
        image: imageUrl,
        prompt: prompts,
        duration: 5,
        resolution: '480p',
        seed: -1,
      }),
    }
  );

  if (!submitResponse.ok) {
    const error = await submitResponse.text();
    console.error(`${tag} Atlas submit FAILED:`, { status: submitResponse.status, body: error });
    throw new Error(`Atlas Cloud submission failed: ${error}`);
  }

  const submitData = await submitResponse.json();
  console.log(`${tag} Atlas submit response:`, JSON.stringify(submitData).slice(0, 500));
  const predictionId = submitData.data?.id || submitData.id;
  if (!predictionId) throw new Error('No prediction ID returned');
  return predictionId;
}

export async function POST(req: NextRequest) {
  // Per-request trace ID so you can correlate logs across an async flow.
  const requestId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // Tracks which code paths fired during this request.
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
    const { data: { user } } = await supabase.auth.getUser();
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
      : companion.personas as CompanionPersona | null;

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
      allPrompts: scenePlan.prompts,
      endWardrobeState: scenePlan.endWardrobeState,
      onWait1: scenePlan.onWait1,
      onWait2: scenePlan.onWait2,
      onMid: scenePlan.onMid,
      usingFrameUrl: Boolean(frameUrl),
      frameUrl: frameUrl || null,
      trace: trace.join(' → '),
      elapsedMs: Date.now() - t0,
    });

    const predictionId = await submitAtlasVideo(imageUrl, scenePlan.prompts, requestId);
    console.log(`[${requestId}] === VIDEO REQUEST END === predictionId=${predictionId} totalMs=${Date.now() - t0}`);

    return NextResponse.json({
      success: true,
      prediction_id: predictionId,
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
