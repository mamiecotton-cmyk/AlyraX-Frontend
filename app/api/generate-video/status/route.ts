import { NextRequest, NextResponse } from 'next/server';

const ATLAS_API_KEY = process.env.ATLAS_CLOUD_API_KEY;

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

export async function POST(req: NextRequest) {
  try {
    const { predictionId } = await req.json();

    if (!predictionId) {
      return NextResponse.json({ error: 'Missing predictionId' }, { status: 400 });
    }

    const statusResponse = await fetch(
      `https://api.atlascloud.ai/api/v1/model/prediction/${predictionId}`,
      {
        headers: {
          'Authorization': `Bearer ${ATLAS_API_KEY}`,
        },
      }
    );

    if (!statusResponse.ok) {
      const error = await statusResponse.text();
      return NextResponse.json({ error }, { status: statusResponse.status });
    }

    const statusData = await statusResponse.json() as AtlasPredictionResponse;
    const status = (statusData.data?.status || statusData.status || '').toLowerCase();

    if (status === 'succeeded' || status === 'completed') {
      const videoUrl = getAtlasOutputUrl(statusData);
      if (!videoUrl) {
        return NextResponse.json({ status, error: 'No video URL in completed response' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        status,
        video_url: videoUrl,
      });
    }

    if (status === 'failed') {
      return NextResponse.json(
        { status, error: statusData.data?.error || statusData.error || 'Atlas generation failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: false,
      status: status || 'processing',
    });
  } catch (error) {
    console.error('Video status error:', error);
    return NextResponse.json({ error: 'Video status failed' }, { status: 500 });
  }
}
