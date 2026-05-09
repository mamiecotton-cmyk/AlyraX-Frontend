import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 300;

const ATLAS_API_KEY = process.env.ATLAS_CLOUD_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const ATLAS_MODEL = 'atlascloud/wan-2.2-turbo-spicy/infinite-image-to-video';

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
      model: 'mistralai/mistral-7b-instruct',
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: `You are a video prompt generator for an adult AI companion app. 
Based on what the user requested, generate exactly 6 sequential video prompts 
describing what the woman in the video does. 

Rules:
- Keep her in roughly the same position throughout — no standing up or walking
- Each prompt escalates naturally from the previous
- Prompts describe subtle, realistic webcam-style movements
- Keep lighting consistent: soft bedroom/intimate lighting
- Always start with "woman" 
- Each prompt is one sentence, max 20 words
- Be explicit based on what was requested
- Return ONLY a JSON array of 6 strings, nothing else

Example format:
["prompt 1", "prompt 2", "prompt 3", "prompt 4", "prompt 5", "prompt 6"]`
        },
        ...recentHistory,
        {
          role: 'user',
          content: `User request: "${userMessage}". Generate 6 escalating video prompts.`
        }
      ],
    }),
  });

  const data = await response.json();
  const content = data.choices[0].message.content.trim();

  try {
    const prompts = JSON.parse(content);
    if (Array.isArray(prompts) && prompts.length === 6) {
      return prompts;
    }
    throw new Error('Invalid prompts format');
  } catch {
    // Fallback prompts if parsing fails
    return [
      "woman looking at camera with a seductive smile, soft bedroom lighting",
      "woman slowly reaching toward camera, eyes locked on viewer",
      "woman arching back slightly, biting her lip softly",
      "woman leaning closer to camera, breathing slowly and deeply",
      "woman running hands slowly down her body, eyes on camera",
      "woman looking intensely at camera, flush with excitement",
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

    const statusData = await statusResponse.json();

    if (statusData.status === 'succeeded' || statusData.status === 'completed') {
      const videoUrl = statusData.output?.url || statusData.data?.url || statusData.output;
      if (videoUrl) return videoUrl;
      throw new Error('No video URL in completed response');
    }

    if (statusData.status === 'failed') {
      throw new Error(`Atlas Cloud generation failed: ${statusData.error}`);
    }

    attempts++;
  }

  throw new Error('Video generation timed out');
}

export async function POST(req: NextRequest) {
  try {
    const { userId, userMessage, conversationHistory } = await req.json();

    if (!userId || !userMessage) {
      return NextResponse.json(
        { error: 'Missing userId or userMessage' },
        { status: 400 }
      );
    }

    // Fetch companion image URL from Supabase
    const supabase = createClient();
    const { data: companion, error } = await supabase
      .from('companions')
      .select('image_url')
      .eq('user_id', userId)
      .single();

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