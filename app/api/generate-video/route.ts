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
  narration: string;
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

function getPersonaNarrationStyle(personaName?: string | null) {
  const normalizedName = personaName?.toLowerCase() || '';

  if (normalizedName.includes('dominant')) {
    return 'Narration voice: calm, commanding, possessive, and in control. Make the user feel instructed to watch.';
  }
  if (normalizedName.includes('submissive')) {
    return 'Narration voice: eager, breathless, warm, devoted, and pleased to be watched.';
  }
  if (normalizedName.includes('classic') || normalizedName.includes('alyrax')) {
    return 'Narration voice: sultry, confident, sophisticated, and teasing.';
  }
  return 'Narration voice: preserve the selected persona tone and emotional style.';
}

function buildFallbackScenePlan(userMessage: string, personaName?: string | null, isUndressed?: boolean): VideoScenePlan {
  const request = userMessage.trim().replace(/\s+/g, ' ').slice(0, 220);
  const normalizedName = personaName?.toLowerCase() || '';
  const narration = normalizedName.includes('dominant')
    ? `Stay right there. I'll make you watch every slow step of exactly what you asked for.`
    : normalizedName.includes('submissive')
      ? `I'm getting it ready for you, slow and teasing, exactly how you wanted to see me.`
      : `Keep your eyes on me. I'm making this slow, teasing, and exactly the way you asked.`;

  const prefix = isUndressed
    ? 'same adult woman already undressed from the source image'
    : 'same adult woman in the source image';

  return {
    prompts: [
      `${prefix} holds seductive eye contact, acknowledging the request: "${request}", same camera and pose`,
      `${prefix} slowly reaches toward camera, eyes locked on viewer, breathing deepens`,
      `${prefix} arches back slightly, biting her lip softly, intimate expression`,
      `${prefix} leaning closer to camera, breathing slowly and deeply`,
      `${prefix} runs hands slowly down her body, eyes on camera`,
      `${prefix} holds a confident seductive pose, intense eye contact, smooth continuous motion`,
    ],
    narration,
  };
}

function extractScenePlan(content: string, userMessage: string, personaName?: string | null, isUndressed?: boolean): VideoScenePlan {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return buildFallbackScenePlan(userMessage, personaName, isUndressed);

  try {
    const scenePlan = JSON.parse(jsonMatch[0]);
    if (
      Array.isArray(scenePlan?.prompts)
      && typeof scenePlan?.narration === 'string'
    ) {
      const prompts = scenePlan.prompts
        .filter((prompt: unknown) => typeof prompt === 'string')
        .slice(0, 6);

      // FIX 1: Loosened validation — just requires "same" and "woman"
      if (
        prompts.length === 6 &&
        prompts.every((prompt: string) =>
          prompt.toLowerCase().includes('same') &&
          prompt.toLowerCase().includes('woman')
        )
      ) {
        return {
          prompts,
          narration: refineNarration(scenePlan.narration, userMessage, personaName),
        };
      }
    }

    if (
      typeof scenePlan?.prompt === 'string'
      && typeof scenePlan?.narration === 'string'
    ) {
      const fallback = buildFallbackScenePlan(userMessage, personaName, isUndressed);
      return {
        prompts: [scenePlan.prompt, ...fallback.prompts.slice(1)],
        narration: refineNarration(scenePlan.narration, userMessage, personaName),
      };
    }
  } catch {
    // fall through
  }

  return buildFallbackScenePlan(userMessage, personaName, isUndressed);
}

function refineNarration(narration: string, userMessage: string, personaName?: string | null) {
  const cleaned = narration.trim();
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  const genericLines = ['like what you see?', 'enjoy the show.', 'watch this.'];

  if (wordCount >= 5 && !genericLines.includes(cleaned.toLowerCase())) {
    return cleaned;
  }

  return buildFallbackScenePlan(userMessage, personaName).narration;
}

async function generateVideoScenePlan(
  userMessage: string,
  conversationHistory: { role: string; content: string }[],
  personaName?: string | null,
  isUndressed?: boolean,
): Promise<VideoScenePlan> {
  const recentHistory = conversationHistory.slice(-4);
  const undressedContext = isUndressed
    ? 'IMPORTANT: The woman is already fully undressed from the previous clip. All 6 prompts must keep her in that undressed state and continue the scene from there. Do NOT re-dress her or start from scratch.'
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
        max_tokens: 600,
        temperature: 0.35,
        messages: [
          {
            role: 'system',
            content: `You generate six image-to-video motion prompts and one short spoken narration line for an adult, spicy AI companion platform.
The user wants sensual, flirtatious, seductive motion that progresses clearly through the requested visual action.
${undressedContext}

Return ONLY valid JSON with this exact shape:
{"prompts":["prompt 1","prompt 2","prompt 3","prompt 4","prompt 5","prompt 6"],"narration":"one short line to speak while the video plays"}

Prompt rules:
- Write exactly 6 prompt strings
- Every prompt starts with "same adult woman in the source image" (or "same adult woman already undressed" if continuing undressed)
- Infer the user's fantasy and make it happen through natural, seductive motion
- Keep the source image as truth: same woman, camera, room, lighting, and starting pose
- Build a six-step progression, each prompt advancing the action
- Include smooth natural motion and same camera continuity in each prompt
- If the user explicitly asks for clothing removal, show gradual clothing removal across all 6 prompts
- For explicit clothing-removal requests, prompt 1 begins the tease, prompts 2-5 progressively remove, prompt 6 has clothing completely removed
- If continuing undressed, keep her undressed throughout all 6 prompts and escalate intimacy
- Avoid sudden transitions like standing up, walking, or changing location
- Max 26 words per prompt

Narration rules:
- Exactly 2-3 short, punchy sentences. Max 45 words total. No rambling.
- Dirty talk only — she is narrating what she is physically doing right now
- Be explicit and specific to what was requested. If they asked for stripping, she describes removing clothing. If touching herself, she describes that in detail.
- First person, present tense, breathless delivery
- No filler phrases like "give me a second" or "just a moment" or "hold on"
- She speaks like she is already doing it, not like she is about to
- ${getPersonaNarrationStyle(personaName)}
- Example for stripping: "Sliding my top off my shoulders, letting it fall. Unclasping my bra now, feeling your eyes on me."
- Example for touching: "Fingers on my clit, slow circles. God you make me so wet just watching."`,
          },
          ...recentHistory,
          {
            role: 'user',
            content: `User request: "${userMessage}". Generate six progressive motion prompts and one narration line.`,
          },
        ],
      }),
    });

    const data = await response.json();
    console.log('OpenRouter response status:', response.status);
    console.log('OpenRouter data:', JSON.stringify(data).slice(0, 500));

    const content = data.choices?.[0]?.message?.content;

    if (!response.ok || !content) {
      console.error('OpenRouter failed or empty content:', data);
      return buildFallbackScenePlan(userMessage, personaName, isUndressed);
    }

    return extractScenePlan(content.trim(), userMessage, personaName, isUndressed);
  } catch (error) {
    console.error('OpenRouter scene plan exception:', error);
    return buildFallbackScenePlan(userMessage, personaName, isUndressed);
  }
}

async function submitAtlasVideo(
  imageUrl: string,
  prompts: string[]
): Promise<string> {
  console.log('Atlas submit starting:', {
    model: ATLAS_MODEL,
    imageHost: (() => {
      try { return new URL(imageUrl).host; } catch { return 'invalid-url'; }
    })(),
    promptCount: prompts.length,
    promptPreview: prompts[0]?.slice(0, 220),
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

  if (!predictionId) {
    throw new Error('No prediction ID returned');
  }

  return predictionId;
}

export async function POST(req: NextRequest) {
  try {
    const { userId, companionId, userMessage, conversationHistory, frameUrl } = await req.json();

    console.log('Video generation request received:', {
      hasUserId: Boolean(userId),
      companionId: companionId || null,
      userMessage,
      hasFrameUrl: Boolean(frameUrl),
      historyCount: Array.isArray(conversationHistory) ? conversationHistory.length : 0,
    });

    if (!userId || !userMessage) {
      return NextResponse.json(
        { error: 'Missing userId or userMessage' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: 'Companion image not found' },
        { status: 404 }
      );
    }

    // FIX 3: Use frameUrl if provided (last frame of previous clip), otherwise use original
    const imageUrl = frameUrl || companion.image_url;
    const isUndressed = Boolean(frameUrl); // if we have a frame, she may be undressed

    const persona = Array.isArray(companion.personas)
      ? companion.personas[0]
      : companion.personas as CompanionPersona | null;

    const scenePlan = await generateVideoScenePlan(
      userMessage,
      conversationHistory || [],
      persona?.name,
      isUndressed,
    );

    console.log('Video scene plan ready:', {
      promptCount: scenePlan.prompts.length,
      promptPreview: scenePlan.prompts[0]?.slice(0, 220),
      narration: scenePlan.narration,
      usingFrameUrl: Boolean(frameUrl),
    });

    const predictionId = await submitAtlasVideo(imageUrl, scenePlan.prompts);
    console.log('Video generation submitted:', { predictionId });

    return NextResponse.json({
      success: true,
      prediction_id: predictionId,
      prompts: scenePlan.prompts,
      narration: scenePlan.narration,
    });

  } catch (error) {
    console.error('Video generation error:', error);
    return NextResponse.json(
      { error: 'Video generation failed' },
      { status: 500 }
    );
  }
}