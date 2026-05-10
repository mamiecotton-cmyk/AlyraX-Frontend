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

function getAtlasOutputUrl(response: AtlasPredictionResponse): string | null {
  const output = response.data?.outputs?.[0]
    || response.outputs?.[0]
    || response.data?.url
    || response.data?.output
    || response.output;

  if (typeof output === 'string') return output;
  return output?.url || null;
}

async function generateVideoPrompts(
  userMessage: string,
  conversationHistory: { role: string; content: string }[]
): Promise<string[]> {
  const recentHistory = conversationHistory.slice(-4);

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
          content: `You generate image-to-video prompts for an adult, spicy AI companion platform.
The user wants sensual, flirtatious, seductive motion, not bland movement.

Return ONLY a valid JSON array of exactly 6 strings. No explanation. No markdown.

Rules:
- Each string starts with "same adult woman"
- Infer the user's fantasy and make it happen through natural, seductive motion
- Keep the source image as truth: same woman, camera, room, lighting, outfit, and starting pose
- Do not invent a bed, chair, new outfit, new pose, new prop, or new camera angle unless already implied
- Build one continuous 5-second sequence, from subtle tease to more intense flirtation
- Prefer motions image-to-video handles well: eye contact, coy smile, lip bite, head tilt, slow lean, shoulder roll, arch, hand tracing neck/chest/waist/hip, hair touch, breathing
- Avoid sudden transitions like standing to lying down, turning around, removing clothing, crawling, dancing, or changing location
- Keep it spicy, intimate, and physically plausible
- Max 20 words per prompt

Good style:
["same adult woman locks eyes with a teasing smile", "same adult woman slowly bites her lip, breathing deeper"]`,
        },
        ...recentHistory,
        {
          role: 'user',
          content: `User request: "${userMessage}". Generate 6 naturally escalating spicy motion prompts that satisfy the request without breaking source-image continuity.`,
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
    return [
      "same adult woman locks eyes with a slow seductive smile",
      "same adult woman tilts her head, biting her lip softly",
      "same adult woman breathes deeper, subtly arching toward the camera",
      "same adult woman traces her fingers slowly along her neck and chest",
      "same adult woman leans closer, holding intense flirtatious eye contact",
      "same adult woman gives a teasing smile, moving her hand down her waist",
    ];
  }

  const trimmed = content.trim();

  try {
    const prompts = JSON.parse(trimmed);
    if (Array.isArray(prompts) && prompts.length === 6) {
      return prompts;
    }
    throw new Error('Invalid format');
  } catch {
    return [
      "same adult woman locks eyes with a slow seductive smile",
      "same adult woman tilts her head, biting her lip softly",
      "same adult woman breathes deeper, subtly arching toward the camera",
      "same adult woman traces her fingers slowly along her neck and chest",
      "same adult woman leans closer, holding intense flirtatious eye contact",
      "same adult woman gives a teasing smile, moving her hand down her waist",
    ];
  }
}

async function generateAtlasVideo(
  imageUrl: string,
  prompts: string[]
): Promise<string> {
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
    throw new Error(`Atlas Cloud submission failed: ${error}`);
  }

  const submitData = await submitResponse.json();
  const predictionId = submitData.data?.id || submitData.id;

  if (!predictionId) {
    throw new Error('No prediction ID returned');
  }

  // Poll for result
  const maxAttempts = 60;
  let attempts = 0;

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 3000));

    const statusResponse = await fetch(
      `https://api.atlascloud.ai/api/v1/model/prediction/${predictionId}`,
      {
        headers: {
          'Authorization': `Bearer ${ATLAS_API_KEY}`,
        },
      }
    );

    const statusData = await statusResponse.json() as AtlasPredictionResponse;
    const status = (statusData.data?.status || statusData.status || '').toLowerCase();

    if (status === 'succeeded' || status === 'completed') {
      const videoUrl = getAtlasOutputUrl(statusData);
      if (videoUrl) return videoUrl;
      throw new Error('No video URL in completed response');
    }

    if (status === 'failed') {
      throw new Error(`Atlas Cloud generation failed: ${statusData.data?.error || statusData.error || 'Unknown error'}`);
    }

    attempts++;
  }

  throw new Error('Video generation timed out');
}

export async function POST(req: NextRequest) {
  try {
    const { userId, companionId, userMessage, conversationHistory } = await req.json();

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

    // Generate 6 video prompts based on user request
    const prompts = await generateVideoPrompts(userMessage, conversationHistory || []);

    // Generate video
    const videoUrl = await generateAtlasVideo(companion.image_url, prompts);

    return NextResponse.json({
      success: true,
      video_url: videoUrl,
      prompts, // return prompts so frontend can use last one for next prediction
    });

  } catch (error) {
    console.error('Video generation error:', error);
    return NextResponse.json(
      { error: 'Video generation failed' },
      { status: 500 }
    );
  }
}
