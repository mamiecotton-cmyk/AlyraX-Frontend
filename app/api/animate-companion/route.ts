import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { audio_base64, image_url } = await req.json();

    if (!audio_base64 || !image_url) {
      return NextResponse.json({ error: 'Missing audio or image' }, { status: 400 });
    }

    // Fetch companion image and convert to base64
    const imageResponse = await fetch(image_url);
    const imageBuffer = await imageResponse.arrayBuffer();
    const image_base64 = Buffer.from(imageBuffer).toString('base64');

    const endpointId = process.env.RUNPOD_LIVEPORTRAIT_ENDPOINT_ID;

    // Submit job
    const submitResponse = await fetch(
      `https://api.runpod.ai/v2/${endpointId}/run`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
        },
        body: JSON.stringify({
          input: {
            image_base64,
            audio_base64,
            fps: 25,
          }
        }),
      }
    );

    if (!submitResponse.ok) {
      const error = await submitResponse.text();
      console.error('RunPod submit error:', error);
      return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
    }

    const { id: jobId } = await submitResponse.json();

    // Poll for result
    let attempts = 0;
    const maxAttempts = 48;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const statusResponse = await fetch(
        `https://api.runpod.ai/v2/${endpointId}/status/${jobId}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
          },
        }
      );

      const statusData = await statusResponse.json();

      if (statusData.status === 'COMPLETED') {
        return NextResponse.json({
          video_base64: statusData.output?.video_base64,
          success: true,
        });
      }

      if (statusData.status === 'FAILED') {
        return NextResponse.json({ error: 'Animation failed' }, { status: 500 });
      }

      attempts++;
    }

    return NextResponse.json({ error: 'Animation timed out' }, { status: 504 });

  } catch (error) {
    console.error('Animation error:', error);
    return NextResponse.json({ error: 'Animation failed' }, { status: 500 });
  }
}
