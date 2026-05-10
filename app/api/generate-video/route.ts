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
  prompt: string;
  narration: string;
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

function buildFallbackScenePlan(userMessage: string): VideoScenePlan {
  const request = userMessage.trim().replace(/\s+/g, ' ').slice(0, 220);

  return {
    prompt: `same adult woman in the source image responds to this request: "${request}", creating one continuous cinematic shot with smooth natural motion, seductive eye contact, a slow smile, subtle breathing, a gentle lean closer, and one hand tracing naturally along her neck, chest, waist, or hip as appropriate, same camera, same outfit, same room, no cuts, no looping, no repeated action`,
    narration: "Keep your eyes on me. I'm making it exactly the way you asked.",
  };
}

function extractScenePlan(content: string, userMessage: string): VideoScenePlan {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return buildFallbackScenePlan(userMessage);

  try {
    const scenePlan = JSON.parse(jsonMatch[0]);
    if (
      typeof scenePlan?.prompt === 'string'
      && typeof scenePlan?.narration === 'string'
      && scenePlan.prompt.toLowerCase().includes('same adult woman')
    ) {
      return {
        prompt: scenePlan.prompt,
        narration: refineNarration(scenePlan.narration, userMessage),
      };
    }
  } catch {
    // Fall through to request-aware fallback.
  }

  return buildFallbackScenePlan(userMessage);
}

function refineNarration(narration: string, userMessage: string) {
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
  return `Keep watching. I'm making this slow, teasing, and exactly what you asked for: ${request}`;
}

async function generateVideoScenePlan(
  userMessage: string,
  conversationHistory: { role: string; content: string }[]
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
            content: `You generate one continuous image-to-video movie prompt and one short spoken narration line for an adult, spicy AI companion platform.
The user wants sensual, flirtatious, seductive motion that feels like a single continuous movie shot.

Return ONLY valid JSON with this exact shape:
{"prompt":"one continuous image-to-video prompt","narration":"one short line to speak while the video plays"}

Prompt rules:
- Write one single paragraph prompt, not an array, not numbered beats
- Start with "same adult woman in the source image"
- Infer the user's fantasy and make it happen through natural, seductive motion
- Keep the source image as truth: same woman, camera, room, lighting, outfit, and starting pose
- Do not invent a bed, chair, new outfit, new pose, new prop, or new camera angle unless already implied
- Build one continuous cinematic shot, not repeated loops or separate clips
- Include words like "one continuous shot", "smooth natural motion", "no cuts", "no looping", "no repeated action"
- Prefer motions image-to-video handles well: eye contact, coy smile, lip bite, head tilt, slow lean, shoulder roll, arch, hand tracing neck/chest/waist/hip, hair touch, breathing
- Avoid sudden transitions like standing to lying down, turning around, removing clothing, crawling, dancing, or changing location
- Keep it spicy, intimate, and physically plausible
- Max 95 words for the prompt

Narration rules:
- One sentence, max 22 words
- Spoken by the companion while the video plays
- Match the user's requested scene
- Spicy, intimate, cinematic, not technical`,
          },
          ...recentHistory,
          {
            role: 'user',
            content: `User request: "${userMessage}". Generate one continuous video prompt and one narration line.`,
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
      return buildFallbackScenePlan(userMessage);
    }

    return extractScenePlan(content.trim(), userMessage);
  } catch (error) {
    console.error('OpenRouter scene plan exception:', error);
    return buildFallbackScenePlan(userMessage);
  }
}

async function submitAtlasVideo(
  imageUrl: string,
  prompt: string
): Promise<string> {
  console.log('Atlas submit starting:', {
    model: ATLAS_MODEL,
    imageHost: (() => {
      try { return new URL(imageUrl).host; } catch { return 'invalid-url'; }
    })(),
    promptPreview: prompt.slice(0, 220),
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
        prompt: [prompt],
        duration: 8,
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
      .select('image_url')
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

    const scenePlan = await generateVideoScenePlan(userMessage, conversationHistory || []);
    console.log('Video scene plan ready:', {
      promptPreview: scenePlan.prompt.slice(0, 220),
      narration: scenePlan.narration,
    });

    const predictionId = await submitAtlasVideo(companion.image_url, scenePlan.prompt);
    console.log('Video generation submitted:', { predictionId });

    return NextResponse.json({
      success: true,
      prediction_id: predictionId,
      prompt: scenePlan.prompt,
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
