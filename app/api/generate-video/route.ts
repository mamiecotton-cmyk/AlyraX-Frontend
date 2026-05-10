import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 300;

const ATLAS_API_KEY = process.env.ATLAS_CLOUD_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const ATLAS_MODEL = 'atlascloud/wan-2.2-turbo-spicy/infinite-image-to-video';

type AtlasPredictionResponse = {
  status?: string;
  output?: string | { url?: string };
  outputs?: string[];
  error?: string;
  data?: {
    status?: string;
    output?: string | { url?: string };
    outputs?: string[];
    url?: string;
    error?: string;
  };
};

type VideoScenePlan = {
  prompts: string[];
  onStart: string;
  onMid: string;
};

type CompanionPersona = {
  name?: string | null;
};

function getAtlasOutputUrl(response: AtlasPredictionResponse): string | null {
  const output = response.data?.outputs?.[0]
    || response.outputs?.[0]
    || response.data?.url
    || response.data?.output
    || response.output;
  if (typeof output === 'string') return output;
  return output?.url || null;
}

function getPersonaVoice(personaName?: string | null) {
  const n = personaName?.toLowerCase() || '';
  if (n.includes('dominant')) return 'Voice: commanding, possessive. She tells him what he is seeing.';
  if (n.includes('submissive')) return 'Voice: breathless, eager, devoted. She describes how much she loves being watched.';
  return 'Voice: sultry, confident, dirty. She narrates like she owns the room.';
}

function getEscalationStage(clipNumber: number): string {
  if (clipNumber <= 2) return 'She is undressing — removing clothing slowly, teasing, revealing her body piece by piece. By the end of these clips she should be fully nude.';
  if (clipNumber <= 4) return 'She is fully nude and touching herself — spreading her legs, showing her pussy, fingering herself, playing with her nipples.';
  return 'She is in full explicit play — fingering herself hard, rubbing her clit fast, moaning, building toward orgasm. Maximum intensity.';
}

function buildFallbackScenePlan(
  userMessage: string,
  personaName?: string | null,
  clipNumber?: number,
  isUndressed?: boolean,
): VideoScenePlan {
  const stage = getEscalationStage(clipNumber || 1);
  const prefix = isUndressed
    ? 'same adult woman already nude from previous clip'
    : 'same adult woman in the source image';

  return {
    prompts: [
      `${prefix} slowly removes clothing, revealing her body, seductive eye contact`,
      `${prefix} slides clothing off her shoulders, arching her back, biting her lip`,
      `${prefix} clothing falling away, hands tracing down her bare body`,
      `${prefix} fully exposed, spreading her legs slowly, fingers moving toward her pussy`,
      `${prefix} touching herself, eyes on camera, fingers circling her clit`,
      `${prefix} fingering herself slowly, head back, mouth open, intense pleasure`,
    ],
    onStart: 'Stripping for you baby. Watch every inch.',
    onMid: 'You see how wet I am? All for you.',
  };
}

function extractScenePlan(
  content: string,
  userMessage: string,
  personaName?: string | null,
  clipNumber?: number,
  isUndressed?: boolean,
): VideoScenePlan {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return buildFallbackScenePlan(userMessage, personaName, clipNumber, isUndressed);

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    const prompts = Array.isArray(parsed?.prompts)
      ? parsed.prompts.filter((p: unknown) => typeof p === 'string').slice(0, 6)
      : [];

    const valid = prompts.length === 6 &&
      prompts.every((p: string) =>
        p.toLowerCase().includes('same') && p.toLowerCase().includes('woman')
      );

    if (!valid) return buildFallbackScenePlan(userMessage, personaName, clipNumber, isUndressed);

    const onStart = typeof parsed?.onStart === 'string' && parsed.onStart.trim().split(' ').length <= 15
      ? parsed.onStart.trim()
      : buildFallbackScenePlan(userMessage, personaName, clipNumber, isUndressed).onStart;

    const onMid = typeof parsed?.onMid === 'string' && parsed.onMid.trim().split(' ').length <= 15
      ? parsed.onMid.trim()
      : buildFallbackScenePlan(userMessage, personaName, clipNumber, isUndressed).onMid;

    return { prompts, onStart, onMid };
  } catch {
    return buildFallbackScenePlan(userMessage, personaName, clipNumber, isUndressed);
  }
}

async function generateVideoScenePlan(
  userMessage: string,
  conversationHistory: { role: string; content: string }[],
  personaName?: string | null,
  clipNumber?: number,
  isUndressed?: boolean,
): Promise<VideoScenePlan> {
  const recentHistory = conversationHistory.slice(-4);
  const clip = clipNumber || 1;
  const stage = getEscalationStage(clip);
  const undressedContext = isUndressed
    ? 'IMPORTANT: She is already fully nude from the previous clip. Keep her nude throughout all 6 prompts. Do NOT re-dress her.'
    : '';

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://alyra-x-frontend.vercel.app',
        'X-Title': 'AlyraX',
      },
      body: JSON.stringify({
        model: 'sao10k/l3-euryale-70b',
        max_tokens: 700,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: `You generate six image-to-video motion prompts and two short dirty talk lines for an adult AI companion platform.

ESCALATION STAGE (clip ${clip}): ${stage}
${undressedContext}
${userMessage ? `USER REQUEST: "${userMessage}" — honor this if it conflicts with the stage.` : 'No specific user request — follow the escalation stage.'}

Return ONLY valid JSON:
{
  "prompts": ["prompt 1","prompt 2","prompt 3","prompt 4","prompt 5","prompt 6"],
  "onStart": "one dirty line spoken when video starts playing",
  "onMid": "one dirty line spoken 15 seconds into the video"
}

PROMPT RULES:
- Exactly 6 strings
- Every prompt starts with "same adult woman in the source image" (or "same adult woman already nude" if continuing nude)
- NEVER invent or name specific clothing items — describe only motion and body parts
- For undressing: "sliding clothing off", "fabric falling away", never "blouse" or "skirt"
- Build a clear 6-step progression through the escalation stage
- Each prompt max 26 words
- Smooth natural webcam motion only — no standing up, walking, changing location

DIRTY TALK RULES:
- onStart: spoken when video begins. Max 12 words. Present tense. Explicit. What she is doing right now.
- onMid: spoken at 15 seconds. Max 12 words. Present tense. Explicit. Continuing the scene.
- First person only. No filler. No promises. Pure action.
- ${getPersonaVoice(personaName)}
- Example onStart: "Sliding everything off for you. Watch me."
- Example onMid: "You see how wet I am? All yours."`,
          },
          ...recentHistory,
          {
            role: 'user',
            content: `Generate clip ${clip} of the scene.`,
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
      return buildFallbackScenePlan(userMessage, personaName, clipNumber, isUndressed);
    }

    return extractScenePlan(content.trim(), userMessage, personaName, clipNumber, isUndressed);
  } catch (error) {
    console.error('OpenRouter scene plan exception:', error);
    return buildFallbackScenePlan(userMessage, personaName, clipNumber, isUndressed);
  }
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
      clipNumber,
    } = await req.json();

    console.log('Video generation request received:', {
      hasUserId: Boolean(userId),
      companionId: companionId || null,
      userMessage,
      hasFrameUrl: Boolean(frameUrl),
      clipNumber: clipNumber || 1,
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
    const isUndressed = Boolean(frameUrl);
    const clip = clipNumber || 1;

    const persona = Array.isArray(companion.personas)
      ? companion.personas[0]
      : companion.personas as CompanionPersona | null;

    const scenePlan = await generateVideoScenePlan(
      userMessage || '',
      conversationHistory || [],
      persona?.name,
      clip,
      isUndressed,
    );

    console.log('Video scene plan ready:', {
      promptCount: scenePlan.prompts.length,
      promptPreview: scenePlan.prompts[0]?.slice(0, 100),
      onStart: scenePlan.onStart,
      onMid: scenePlan.onMid,
      clipNumber: clip,
      usingFrameUrl: Boolean(frameUrl),
    });

    const predictionId = await submitAtlasVideo(imageUrl, scenePlan.prompts);
    console.log('Video generation submitted:', { predictionId });

    return NextResponse.json({
      success: true,
      prediction_id: predictionId,
      onStart: scenePlan.onStart,
      onMid: scenePlan.onMid,
    });

  } catch (error) {
    console.error('Video generation error:', error);
    return NextResponse.json({ error: 'Video generation failed' }, { status: 500 });
  }
}