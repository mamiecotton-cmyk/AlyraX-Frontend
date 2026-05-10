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

function buildFallbackScenePlan(userMessage: string, personaName?: string | null): VideoScenePlan {
  const request = userMessage.trim().replace(/\s+/g, ' ').slice(0, 220);
  const normalizedName = personaName?.toLowerCase() || '';
  const narration = normalizedName.includes('dominant')
    ? `Stay right there. I'll make you watch every slow step of exactly what you asked for.`
    : normalizedName.includes('submissive')
      ? `I'm getting it ready for you, slow and teasing, exactly how you wanted to see me.`
      : `Keep your eyes on me. I'm making this slow, teasing, and exactly the way you asked.`;

  return {
    prompts: [
      `same adult woman in the source image holds seductive eye contact, acknowledging the request: "${request}", same camera and pose`,
      'same adult woman slowly touches the clothing she was asked to remove, teasing the edge with smooth natural motion',
      'same adult woman begins loosening the requested clothing, moving carefully and continuously while keeping eye contact',
      'same adult woman slides the requested clothing farther off her body, breathing deeper, same room and camera',
      'same adult woman removes the requested clothing almost completely, pausing with a teasing smile and natural movement',
      'same adult woman has the requested clothing completely removed, holding a confident seductive pose, smooth continuous finish',
    ],
    narration,
  };
}

function extractScenePlan(content: string, userMessage: string, personaName?: string | null): VideoScenePlan {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return buildFallbackScenePlan(userMessage, personaName);

  try {
    const scenePlan = JSON.parse(jsonMatch[0]);
    if (
      Array.isArray(scenePlan?.prompts)
      && typeof scenePlan?.narration === 'string'
    ) {
      const prompts = scenePlan.prompts
        .filter((prompt: unknown) => typeof prompt === 'string')
        .slice(0, 6);

      if (prompts.length === 6 && prompts.every((prompt: string) => prompt.toLowerCase().includes('same adult woman'))) {
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
      const fallback = buildFallbackScenePlan(userMessage, personaName);
      return {
        prompts: [
          scenePlan.prompt,
          ...fallback.prompts.slice(1),
        ],
        narration: refineNarration(scenePlan.narration, userMessage, personaName),
      };
    }
  } catch {
    // Fall through to request-aware fallback.
  }

  return buildFallbackScenePlan(userMessage, personaName);
}

function refineNarration(narration: string, userMessage: string, personaName?: string | null) {
  const cleaned = narration.trim();
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  const genericLines = [
    'like what you see?',
    'enjoy the show.',
    'watch this.',
  ];

  if (wordCount >= 5 && !genericLines.includes(cleaned.toLowerCase())) {
    return cleaned;
  }

  const request = userMessage.trim().replace(/\s+/g, ' ');
  return buildFallbackScenePlan(request, personaName).narration;
}

async function generateVideoScenePlan(
  userMessage: string,
  conversationHistory: { role: string; content: string }[],
  personaName?: string | null
): Promise<VideoScenePlan> {
  const recentHistory = conversationHistory.slice(-4);

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
        max_tokens: 500,
        temperature: 0.35,
        messages: [
          {
            role: 'system',
          content: `You generate six image-to-video motion prompts and one short spoken narration line for an adult, spicy AI companion platform.
The user wants sensual, flirtatious, seductive motion that progresses clearly through the requested visual action.

Return ONLY valid JSON with this exact shape:
{"prompts":["prompt 1","prompt 2","prompt 3","prompt 4","prompt 5","prompt 6"],"narration":"one short line to speak while the video plays"}

Prompt rules:
- Write exactly 6 prompt strings
- Every prompt starts with "same adult woman in the source image"
- Infer the user's fantasy and make it happen through natural, seductive motion
- Keep the source image as truth: same woman, camera, room, lighting, outfit, and starting pose
- Do not invent a bed, chair, new outfit, new pose, new prop, or new camera angle unless already implied
- Build a six-step progression, each prompt advancing the action, not repeating the same motion
- Include smooth natural motion and same camera continuity in each prompt
- Prefer motions image-to-video handles well: eye contact, coy smile, lip bite, head tilt, slow lean, shoulder roll, arch, hand tracing neck/chest/waist/hip, hair touch, breathing
- If the user explicitly asks for clothing removal, show gradual clothing removal across all 6 prompts
- For explicit clothing-removal requests, prompt 1 begins the tease, prompts 2-5 progressively remove the requested clothing, and prompt 6 has the requested clothing completely removed
- Avoid sudden transitions like standing to lying down, turning around, crawling, dancing, or changing location
- Keep it spicy, intimate, and physically plausible
- Max 26 words per prompt

Narration rules:
- One or two short sentences, max 34 words total
- Spoken by the companion while the video generates, before the video is ready
- Summarize the six-stage visual plan in a sexy way without listing numbers
- Match the user's requested scene and selected persona voice
- ${getPersonaNarrationStyle(personaName)}
- Spicy, intimate, cinematic, not technical`,
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

    // Log for debugging
    console.log('OpenRouter response status:', response.status);
    console.log('OpenRouter data:', JSON.stringify(data).slice(0, 500));

    const content = data.choices?.[0]?.message?.content;

    if (!response.ok || !content) {
      console.error('OpenRouter failed or empty content:', data);
      return buildFallbackScenePlan(userMessage, personaName);
    }

    return extractScenePlan(content.trim(), userMessage, personaName);
  } catch (error) {
    console.error('OpenRouter scene plan exception:', error);
    return buildFallbackScenePlan(userMessage, personaName);
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

  // Submit job
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
    const { userId, companionId, userMessage, conversationHistory } = await req.json();

    console.log('Video generation request received:', {
      hasUserId: Boolean(userId),
      companionId: companionId || null,
      userMessage,
      historyCount: Array.isArray(conversationHistory) ? conversationHistory.length : 0,
    });

    if (!userId || !userMessage) {
      return NextResponse.json(
        { error: 'Missing userId or userMessage' },
        { status: 400 }
      );
    }

    // Fetch companion image URL from Supabase
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

    const { data: companion, error } = await companionQuery
      .limit(1)
      .maybeSingle();

    if (error || !companion?.image_url) {
      return NextResponse.json(
        { error: 'Companion image not found' },
        { status: 404 }
      );
    }

    const persona = Array.isArray(companion.personas)
      ? companion.personas[0]
      : companion.personas as CompanionPersona | null;
    const scenePlan = await generateVideoScenePlan(userMessage, conversationHistory || [], persona?.name);
    console.log('Video scene plan ready:', {
      promptCount: scenePlan.prompts.length,
      promptPreview: scenePlan.prompts[0]?.slice(0, 220),
      narration: scenePlan.narration,
    });

    const predictionId = await submitAtlasVideo(companion.image_url, scenePlan.prompts);
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
