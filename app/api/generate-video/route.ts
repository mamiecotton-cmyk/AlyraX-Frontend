import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { buildVideoDirectivePhrase, type SessionDirectives } from '@/lib/session-directives';

export const maxDuration = 300;

const ATLAS_API_KEY = process.env.ATLAS_CLOUD_API_KEY;
const ATLAS_MODEL = 'atlascloud/wan-2.2-turbo-spicy/infinite-image-to-video';
const MAX_ATLAS_PROMPT_CHARS = 180;

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
  readyLine: string;
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

function getImageReference(isContinuation?: boolean): string {
  return isContinuation
    ? 'Reference the generated frame from the last clip'
    : 'Reference the starting image';
}

function getFallbackReadyLine(personaName?: string | null, isContinuation?: boolean) {
  const name = personaName?.toLowerCase() || '';
  const setup = isContinuation ? 'The next part is ready' : 'Your video is ready';
  if (name.includes('dominant')) return `${setup}. Watch closely, because I am about to show you exactly where this goes.`;
  if (name.includes('submissive')) return `${setup}. I made it flow from the last moment, just how you wanted.`;
  return `${setup}. I kept it smooth and close to what you asked for.`;
}

function normalizeAtlasPrompt(prompt: string): string {
  const compactPrompt = prompt.replace(/\s+/g, ' ').replace(/\s+;\s+/g, '; ').trim();
  if (compactPrompt.length <= MAX_ATLAS_PROMPT_CHARS) return compactPrompt;

  const clipped = compactPrompt.slice(0, MAX_ATLAS_PROMPT_CHARS + 1);
  const wordBoundary = Math.max(
    clipped.lastIndexOf(' '),
    clipped.lastIndexOf(','),
    clipped.lastIndexOf(';')
  );

  return clipped
    .slice(0, wordBoundary > 80 ? wordBoundary : MAX_ATLAS_PROMPT_CHARS)
    .replace(/[;,\s]+$/g, '')
    .trim();
}

function getFallbackAction(userMessage?: string) {
  const request = (userMessage || '').replace(/\s+/g, ' ').trim();
  if (!request) return 'continue the requested motion with visible progression';

  return request
    .replace(/^i\s*(want|wanna|would like)\s*(to\s*)?(see|watch)?\s*/i, '')
    .replace(/^you\s*/i, '')
    .replace(/\byour\b/gi, 'her')
    .replace(/\byou\b/gi, 'she')
    .replace(/[.?!]+$/g, '')
    .trim()
    .slice(0, 90) || 'continue the requested motion with visible progression';
}

function getPersonaWaitLine(personaName?: string | null) {
  const name = personaName?.toLowerCase() || '';
  if (name.includes('dominant')) return 'I am setting that up now. Tell me exactly how you want the next part to feel.';
  if (name.includes('submissive')) return 'I am making that for you now. Tell me if you want the next part slower or bolder.';
  return 'I am making that for you now. Talk to me, what should happen after this part?';
}

function getClipProgression(clipNumber: number, action: string) {
  const phase = ((clipNumber - 1) % 4) + 1;

  if (phase === 1) {
    return [
      `begin ${action}; slow natural movement`,
      `continue ${action}; small pose change; steady camera-facing motion`,
      `progress ${action}; hands and shoulders move with clear purpose`,
      `continue ${action}; one continuous shot; no reset to first pose`,
      `deepen ${action}; natural breathing and expression`,
      `finish this first beat with ${action} visibly progressed; hold final pose`,
    ];
  }

  if (phase === 2) {
    return [
      `resume from the held pose; continue ${action}; no restart`,
      `shift weight and angle slightly while continuing ${action}`,
      `move hands more deliberately; make ${action} clearly advance`,
      `keep camera-facing motion; expression reacts to the progression`,
      `slow down for a close transitional beat; maintain continuity`,
      `end clip ${clipNumber} in a new pose that sets up the next clip`,
    ];
  }

  if (phase === 3) {
    return [
      `start from the prior end pose; intensify ${action}`,
      `change shoulder and hip angle while continuing ${action}`,
      `make the motion smoother and more confident; no looped gesture`,
      `hold eye contact as the body position changes again`,
      `progress to a more advanced pose; keep motion fluid`,
      `finish clip ${clipNumber} with the action further along than it began`,
    ];
  }

  return [
    `continue from the last frame; sustain ${action} with fluid motion`,
    `vary the rhythm and pose; avoid repeating the previous gesture`,
    `move into a new angle while keeping the same scene continuity`,
    `make hands and body motion visibly different from earlier clips`,
    `build to the strongest pose in this sequence`,
    `end clip ${clipNumber} with a clear new final pose for continuation`,
  ];
}

function buildScenePlan(
  userMessage?: string,
  personaName?: string | null,
  clipNumber?: number,
  isUndressed?: boolean,
  directives?: SessionDirectives | null,
): VideoScenePlan {
  const reference = getImageReference(isUndressed);
  const action = getFallbackAction(userMessage);
  const clip = clipNumber || 1;
  const continuity = isUndressed ? 'continue from the exact pose in the generated frame' : 'start from the pose in the image';
  const directivePhrase = buildVideoDirectivePhrase(directives);
  const progression = getClipProgression(clip, action);

  return {
    prompts: progression.map((step, index) =>
      normalizeAtlasPrompt([
        `${reference}; clip ${clip} step ${index + 1}`,
        continuity,
        directivePhrase,
        step,
      ].filter(Boolean).join('; '))
    ),
    onWait1: getPersonaWaitLine(personaName),
    onWait2: '',
    onMid: '',
    readyLine: getFallbackReadyLine(personaName, isUndressed),
    waitLines: [],
  };
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
      directives,
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

    const scenePlan = buildScenePlan(
      userMessage || '',
      persona?.name,
      clip,
      isUndressed,
      directives,
    );

    console.log('Video scene plan ready:', {
      promptCount: scenePlan.prompts.length,
      promptPreview: scenePlan.prompts[0]?.slice(0, 100),
      onWait1: scenePlan.onWait1,
      onWait2: scenePlan.onWait2,
      onMid: scenePlan.onMid,
      readyLine: scenePlan.readyLine,
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
      readyLine: scenePlan.readyLine,
      waitLines: scenePlan.waitLines,
    });

  } catch (error) {
    console.error('Video generation error:', error);
    return NextResponse.json({ error: 'Video generation failed' }, { status: 500 });
  }
}
