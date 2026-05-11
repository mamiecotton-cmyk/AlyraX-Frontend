import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 300;

const ATLAS_API_KEY = process.env.ATLAS_CLOUD_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const ATLAS_MODEL = 'atlascloud/wan-2.2-turbo-spicy/infinite-image-to-video';
const OPENROUTER_MODEL = 'sao10k/l3-euryale-70b';
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

function nextWardrobeState(start: WardrobeState): WardrobeState {
  if (start === 'clothed') return 'partial';
  if (start === 'partial') return 'nude';
  return 'nude';
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

function buildFallbackScenePlan(
  userMessage: string,
  wardrobeState: WardrobeState,
): VideoScenePlan {
  const endWardrobeState = nextWardrobeState(wardrobeState);

  if (wardrobeState === 'nude') {
    return {
      prompts: [
        'She shifts closer to camera, turns her hips slowly, hands tracing over bare skin',
        'She walks forward, changes framing, arches her back, keeps confident eye contact',
        'She turns sideways, runs her hands over her chest and thighs, breathing harder',
        'She settles into a closer frame, moving with slow deliberate confidence',
      ],
      onWait1: 'I am moving closer for you now, slow and deliberate.',
      onWait2: 'Almost there. I am keeping my eyes on you while I change the angle.',
      onMid: 'Watch me move for you.',
      endWardrobeState,
    };
  }

  if (wardrobeState === 'partial') {
    return {
      prompts: [
        'She shifts her weight, turns toward camera, revealing more skin with each step',
        'She walks closer, changes framing, hands moving slowly over her body',
        'She turns her hips, lets the scene progress until her body is fully revealed',
        'She settles into a closer frame, confident and exposed by the end',
      ],
      onWait1: 'I am coming closer and letting the moment build.',
      onWait2: 'Almost ready. I am changing the angle so you can see me better.',
      onMid: 'Keep your eyes on me.',
      endWardrobeState,
    };
  }

  return {
    prompts: [
      'She shifts in place, turns toward camera, beginning a slow teasing reveal',
      'She walks closer, changes framing, hands moving with deliberate confidence',
      'She turns her shoulders and hips, letting the scene become more intimate',
      'She ends closer to camera, partially revealed, steady eye contact',
    ],
    onWait1: 'I am starting slow for you, letting the camera catch every little change.',
    onWait2: 'Almost ready. I am moving closer and making the frame more intimate.',
    onMid: 'Stay with me.',
    endWardrobeState,
  };
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
  userMessage: string,
  wardrobeState: WardrobeState,
): VideoScenePlan {
  const fallback = buildFallbackScenePlan(userMessage, wardrobeState);
  const parsed = extractJsonObject(content);
  if (!parsed) return fallback;

  const rawPrompts = Array.isArray(parsed.prompts)
    ? parsed.prompts.filter((prompt): prompt is string => typeof prompt === 'string')
    : [];
  const prompts = sanitizePrompts(rawPrompts, wardrobeState);
  if (prompts.length < 3 || prompts.length > 6) return fallback;

  const onWait1 = typeof parsed.onWait1 === 'string' && parsed.onWait1.trim()
    ? parsed.onWait1.trim()
    : fallback.onWait1;
  const onWait2 = typeof parsed.onWait2 === 'string' && parsed.onWait2.trim()
    ? parsed.onWait2.trim()
    : fallback.onWait2;
  const onMid = typeof parsed.onMid === 'string' && parsed.onMid.trim()
    ? parsed.onMid.trim()
    : fallback.onMid;

  return {
    prompts,
    onWait1,
    onWait2,
    onMid,
    endWardrobeState: clampEndWardrobeState(parsed.endWardrobeState, fallback.endWardrobeState),
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
  console.log('OpenRouter response status:', response.status);
  console.log('OpenRouter data:', JSON.stringify(data).slice(0, 600));

  const content = data.choices?.[0]?.message?.content;
  if (!response.ok || !content) {
    console.error('OpenRouter failed:', data);
    return null;
  }

  return content.trim();
}

async function generateVideoScenePlan(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  wardrobeState: WardrobeState,
  personaName?: string | null,
): Promise<VideoScenePlan> {
  let retryReason: string | undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const content = await askEuryaleForScenePlan(
        userMessage,
        conversationHistory,
        wardrobeState,
        personaName,
        retryReason,
      );

      if (!content) break;

      const parsedJson = extractJsonObject(content);
      const rawPrompts = Array.isArray(parsedJson?.prompts)
        ? parsedJson.prompts.filter((prompt): prompt is string => typeof prompt === 'string')
        : [];

      if (hasNudeLeak(rawPrompts, wardrobeState)) {
        retryReason = 'nude prompt contained a banned wardrobe word';
        console.warn('Nude prompt leak detected; regenerating');
        continue;
      }

      if (rawPrompts.length < 3 || rawPrompts.length > 6) {
        retryReason = 'prompt count must be between 3 and 6';
        continue;
      }

      return parseScenePlan(content, userMessage, wardrobeState);
    } catch (error) {
      console.error('OpenRouter scene plan exception:', error);
      retryReason = 'provider error';
    }
  }

  return buildFallbackScenePlan(userMessage, wardrobeState);
}

async function submitAtlasVideo(imageUrl: string, prompts: string[]): Promise<string> {
  console.log('Atlas submit starting:', {
    model: ATLAS_MODEL,
    imageHost: (() => { try { return new URL(imageUrl).host; } catch { return 'invalid-url'; } })(),
    promptCount: prompts.length,
    promptPreview: prompts[0]?.slice(0, 100),
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
    console.error('Atlas submit failed:', submitResponse.status, error);
    throw new Error(`Atlas Cloud submission failed: ${error}`);
  }

  const submitData = await submitResponse.json();
  console.log('Atlas submit response:', JSON.stringify(submitData).slice(0, 500));
  const predictionId = submitData.data?.id || submitData.id;
  if (!predictionId) throw new Error('No prediction ID returned');
  return predictionId;
}

export async function POST(req: NextRequest) {
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

    console.log('Video generation request received:', {
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
    );

    console.log('Video scene plan ready:', {
      promptCount: scenePlan.prompts.length,
      promptPreview: scenePlan.prompts[0]?.slice(0, 100),
      endWardrobeState: scenePlan.endWardrobeState,
      onWait1: scenePlan.onWait1,
      onWait2: scenePlan.onWait2,
      onMid: scenePlan.onMid,
      usingFrameUrl: Boolean(frameUrl),
    });

    const predictionId = await submitAtlasVideo(imageUrl, scenePlan.prompts);
    console.log('Video generation submitted:', { predictionId });

    return NextResponse.json({
      success: true,
      prediction_id: predictionId,
      endWardrobeState: scenePlan.endWardrobeState,
      onWait1: scenePlan.onWait1,
      onWait2: scenePlan.onWait2,
      onMid: scenePlan.onMid,
    });
  } catch (error) {
    console.error('Video generation error:', error);
    return NextResponse.json({ error: 'Video generation failed' }, { status: 500 });
  }
}
