import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 300;

const ATLAS_API_KEY = process.env.ATLAS_CLOUD_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const ATLAS_MODEL = 'atlascloud/wan-2.2-turbo-spicy/infinite-image-to-video';
const MAX_ATLAS_PROMPT_CHARS = 180;
const ATLAS_NEGATIVE_GUARDRAIL = 'avoid: cuts, loops, resets, duplicate frames, flicker, warped hands, extra limbs';

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
  onWait1: string;
  onWait2: string;
  onMid: string;
  waitLines: string[];
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

function getImageReference(isContinuation?: boolean): string {
  return isContinuation
    ? 'Reference the generated frame from the last clip'
    : 'Reference the starting image';
}

function getClipMotionDirective(clipNumber: number): string {
  if (clipNumber <= 1) return 'begin the requested action, moving slowly from the pose in the reference image';
  if (clipNumber === 2) return 'continue from the generated frame, make the action clearly progress, do not reset the pose';
  if (clipNumber === 3) return 'continue from the generated frame with more advanced motion and a changed body position';
  if (clipNumber === 4) return 'continue from the generated frame with close, deliberate hand and hip motion';
  if (clipNumber === 5) return 'continue from the generated frame with faster, more intense motion';
  return 'continue from the generated frame, sustain the climax of the requested scene without restarting';
}

function normalizeAtlasPrompt(prompt: string): string {
  const compactPrompt = prompt.replace(/\s+/g, ' ').replace(/\s+;\s+/g, '; ').trim();
  const withoutDuplicateGuardrail = compactPrompt
    .replace(/\s*;?\s*avoid:\s*cuts, loops, resets, duplicate frames, flicker, warped hands, extra limbs/gi, '')
    .trim();
  const suffix = `; ${ATLAS_NEGATIVE_GUARDRAIL}`;

  if (`${withoutDuplicateGuardrail}${suffix}`.length <= MAX_ATLAS_PROMPT_CHARS) {
    return `${withoutDuplicateGuardrail}${suffix}`;
  }

  const availableChars = MAX_ATLAS_PROMPT_CHARS - suffix.length;
  const trimmedPrompt = withoutDuplicateGuardrail
    .slice(0, Math.max(availableChars, 0))
    .replace(/[;,\s]+$/g, '')
    .trim();

  return `${trimmedPrompt}${suffix}`;
}

function buildFallbackScenePlan(
  userMessage?: string,
  personaName?: string | null,
  clipNumber?: number,
  isUndressed?: boolean,
): VideoScenePlan {
  const stage = getEscalationStage(clipNumber || 1);
  const reference = getImageReference(isUndressed);
  const motion = getClipMotionDirective(clipNumber || 1);

  return {
    prompts: [
      normalizeAtlasPrompt(`${reference}; ${stage}; ${motion}; smooth continuous motion, natural eye contact`),
      normalizeAtlasPrompt(`${reference}; continue prior pose, deepen motion, hands move deliberately, body position changes`),
      normalizeAtlasPrompt(`${reference}; progress action further, hips and shoulders shift naturally, camera-facing movement`),
      normalizeAtlasPrompt(`${reference}; maintain continuity from frame, slower teasing motion, visible progression from prompt 3`),
      normalizeAtlasPrompt(`${reference}; continue confidently, natural breathing and expression, changed pose`),
      normalizeAtlasPrompt(`${reference}; complete this clip's progression, hold new end pose for next frame`),
    ],
    onWait1: 'Getting naked for you right now baby. Sliding everything off nice and slow, letting you see every inch of me.',
    onWait2: 'Almost ready for you. Running my hands down my bare skin, thinking about your eyes on me.',
    onMid: 'You see how wet I am? All for you.',
    waitLines: [
      'I heard exactly what you asked for. Stay with me while I make it worth watching.',
      'Tell me what you want me to do next while this one finishes.',
      'I am keeping the scene moving for you, nice and smooth.',
      'Almost there. Keep your eyes on me.',
    ],
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

    const expectedReference = getImageReference(isUndressed);
    const forbiddenReferencePattern = /\b(same adult woman|same woman|source image)\b/i;
    const forbiddenReferenceReplacePattern = /\b(same adult woman|same woman|source image)\b/gi;
    const prompts = Array.isArray(parsed.prompts)
      ? parsed.prompts
          .filter((p: unknown) => typeof p === 'string')
          .slice(0, 6)
          .map((p: string) => {
            const cleaned = p
              .replace(forbiddenReferenceReplacePattern, expectedReference)
              .replace(/^reference (the starting image|the generated frame from the last clip);?\s*/i, '')
              .trim();
            return normalizeAtlasPrompt(`${expectedReference}; ${cleaned}`);
          })
      : buildFallbackScenePlan(userMessage, personaName, clipNumber, isUndressed).prompts;

    const valid =
      Array.isArray(prompts) &&
      prompts.length === 6 &&
      prompts.every((p: string) =>
        p.toLowerCase().startsWith(expectedReference.toLowerCase()) &&
        p.length <= MAX_ATLAS_PROMPT_CHARS &&
        p.toLowerCase().includes('avoid:') &&
        !forbiddenReferencePattern.test(p)
      );

    if (!valid) return buildFallbackScenePlan(userMessage, personaName, clipNumber, isUndressed);

    const fallback = buildFallbackScenePlan(userMessage, personaName, clipNumber, isUndressed);

    const onWait1 = typeof parsed?.onWait1 === 'string' && parsed.onWait1.trim().length > 0
      ? parsed.onWait1.trim()
      : fallback.onWait1;

    const onWait2 = typeof parsed?.onWait2 === 'string' && parsed.onWait2.trim().length > 0
      ? parsed.onWait2.trim()
      : fallback.onWait2;

    const onMid = typeof parsed?.onMid === 'string' && parsed.onMid.trim().length > 0
      ? parsed.onMid.trim()
      : fallback.onMid;

    const waitLines = Array.isArray(parsed.waitLines)
      ? parsed.waitLines
          .filter((line: unknown) => typeof line === 'string' && line.trim().length > 0)
          .map((line: string) => line.trim())
          .slice(0, 5)
      : fallback.waitLines;

    return {
      prompts,
      onWait1,
      onWait2,
      onMid,
      waitLines: waitLines.length > 0 ? waitLines : fallback.waitLines,
    };
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
  const reference = getImageReference(isUndressed);
  const motionDirective = getClipMotionDirective(clip);

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
            content: `You write explicit adult video prompts based on what the user wants to see.

USER WANTS: "${userMessage || 'continue the scene naturally'}"
STAGE (clip ${clip}): ${stage}
IMAGE REFERENCE WORDING: every prompt must begin with "${reference};"
CONTINUITY DIRECTION: ${motionDirective}
${isUndressed ? 'She is already nude. Stay nude all 6 prompts.' : ''}

HARD RULE — do not write "same adult woman", "same woman", or "source image". Use only the required image reference wording above.
HARD RULE — ZERO clothing words after the reference phrase. Not fabric, sleeve, top, bottom, panties, bra, shirt, dress, underwear, outfit. Body parts only: skin, breasts, nipples, chest, hips, thighs, pussy, clit, fingers, hands, back, stomach.

CLIP ${clip} MUST END WITH: ${clip <= 1 ? 'breasts fully exposed' : clip === 2 ? 'completely nude' : 'nude and actively touching her pussy'}

Return ONLY valid JSON:
{"prompts":["p1","p2","p3","p4","p5","p6"],"onWait1":"1 conversational sentence max 18 words","onWait2":"1 conversational sentence max 18 words","onMid":"1 explicit sentence max 15 words","waitLines":["line1","line2","line3","line4"]}

Prompts: 6 strings, max 18 words each after the required reference phrase. Each prompt must progress from the previous prompt and must not repeat exact wording from earlier clips. Do not write negative/avoid/no-quality terms; the server appends those.
Wait dialogue: first person, present tense, conversational, varied, persona-matched. It should invite the user to answer while the video generates; do not repeat the same idea.
${getPersonaVoice(personaName)}`,
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
  const atlasPrompts = prompts.map(normalizeAtlasPrompt);
  console.log('Atlas submit starting:', {
    model: ATLAS_MODEL,
    imageHost: (() => { try { return new URL(imageUrl).host; } catch { return 'invalid-url'; } })(),
    promptCount: atlasPrompts.length,
    promptLengths: atlasPrompts.map((prompt) => prompt.length),
    promptPreview: atlasPrompts[0]?.slice(0, 140),
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
        prompt: atlasPrompts,
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
      onWait1: scenePlan.onWait1,
      onWait2: scenePlan.onWait2,
      onMid: scenePlan.onMid,
      waitLines: scenePlan.waitLines,
      clipNumber: clip,
      usingFrameUrl: Boolean(frameUrl),
    });

    const predictionId = await submitAtlasVideo(imageUrl, scenePlan.prompts);
    console.log('Video generation submitted:', { predictionId });

    return NextResponse.json({
      success: true,
      prediction_id: predictionId,
      onWait1: scenePlan.onWait1,
      onWait2: scenePlan.onWait2,
      onMid: scenePlan.onMid,
      waitLines: scenePlan.waitLines,
    });

  } catch (error) {
    console.error('Video generation error:', error);
    return NextResponse.json({ error: 'Video generation failed' }, { status: 500 });
  }
}
