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
  const output =
    response.data?.outputs?.[0] ||
    response.outputs?.[0] ||
    response.data?.url ||
    response.data?.output ||
    response.output;

  if (typeof output === 'string') return output;
  return output?.url || null;
}

// ─── RunPod polling ───────────────────────────────────────────────────────

async function uploadVideoToSupabase(
  videoBuffer: Buffer,
  jobId: string,
): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );

  const fileName = `videos/${Date.now()}-${jobId.replace(/[^a-zA-Z0-9_-]/g, '-')}.webp`;

  const { error: uploadError } = await supabase.storage
    .from('companions')
    .upload(fileName, videoBuffer, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Supabase video upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('companions')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

async function checkRunPodVideoStatus(jobId: string): Promise<{
  status: string;
  video_url?: string;
  error?: string;
}> {
  const endpointId = process.env.RUNPOD_VIDEO_ENDPOINT_ID;
  if (!endpointId) {
    return { status: 'failed', error: 'RUNPOD_VIDEO_ENDPOINT_ID not configured' };
  }

  const res = await fetch(
    `https://api.runpod.ai/v2/${endpointId}/status/${jobId}`,
    {
      headers: { Authorization: `Bearer ${process.env.RUNPOD_API_KEY}` },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`RunPod video status error (${res.status}):`, body);
    return { status: 'failed', error: `RunPod status check failed: ${res.status}` };
  }

  const data = await res.json();
  console.log(`RunPod video job ${jobId} status:`, data.status);

  if (data.status === 'FAILED') {
    return { status: 'failed', error: data.error || 'RunPod job failed' };
  }

  if (data.status === 'COMPLETED') {
    // Output is base64 WEBP from SaveAnimatedWEBP node
    const output = data.output;

    // Handle array of outputs (ComfyUI wizard format)
    let base64Data: string | null = null;

    if (Array.isArray(output)) {
      // Find the image/webp output
      const imageOutput = output.find(
        (item: { type?: string; data?: string }) =>
          item?.type === 'image/webp' || item?.type === 'base64' || item?.data,
      );
      base64Data = imageOutput?.data || null;
    } else if (typeof output === 'object' && output !== null) {
      // Single object output
      const outputObj = output as Record<string, unknown>;
      // Handle ComfyUI wizard format: output.images[0].data
      const images = Array.isArray(outputObj.images) ? outputObj.images : [];
      const firstImage = images[0] as { data?: string; type?: string } | undefined;
      base64Data =
        (typeof firstImage?.data === 'string' ? firstImage.data : null) ||
        (typeof outputObj.data === 'string' ? outputObj.data : null) ||
        (typeof outputObj.image === 'string' ? outputObj.image : null) ||
        null;
    } else if (typeof output === 'string') {
      base64Data = output;
    }

    if (!base64Data) {
      console.error('RunPod video completed but no base64 data found:', JSON.stringify(data).slice(0, 500));
      return { status: 'failed', error: 'No video data in RunPod output' };
    }

    // Strip data URL prefix if present
    const rawBase64 = base64Data.includes(',')
      ? base64Data.split(',').pop() ?? base64Data
      : base64Data;

    try {
      const videoBuffer = Buffer.from(rawBase64, 'base64');
      const videoUrl = await uploadVideoToSupabase(videoBuffer, jobId);
      return { status: 'succeeded', video_url: videoUrl };
    } catch (err) {
      console.error('Failed to upload RunPod video to Supabase:', err);
      // Return as data URL fallback
      return {
        status: 'succeeded',
        video_url: `data:image/webp;base64,${rawBase64}`,
      };
    }
  }

  // IN_QUEUE, IN_PROGRESS, etc.
  return { status: data.status?.toLowerCase() || 'processing' };
}

// ─── Atlas polling ────────────────────────────────────────────────────────

async function checkAtlasVideoStatus(predictionId: string): Promise<{
  status: string;
  video_url?: string;
  error?: string;
}> {
  const statusResponse = await fetch(
    `https://api.atlascloud.ai/api/v1/model/prediction/${predictionId}`,
    {
      headers: { Authorization: `Bearer ${ATLAS_API_KEY}` },
    },
  );

  if (!statusResponse.ok) {
    const error = await statusResponse.text();
    if (error.toLowerCase().includes('redislock: not obtained')) {
      console.warn('Atlas status temporarily locked, continuing polling');
      return { status: 'processing' };
    }
    return { status: 'failed', error };
  }

  const statusData = (await statusResponse.json()) as AtlasPredictionResponse;
  const status = (statusData.data?.status || statusData.status || '').toLowerCase();

  if (status === 'succeeded' || status === 'completed') {
    const videoUrl = getAtlasOutputUrl(statusData);
    if (!videoUrl) {
      return { status: 'failed', error: 'No video URL in completed Atlas response' };
    }
    return { status: 'succeeded', video_url: videoUrl };
  }

  if (status === 'failed') {
    return {
      status: 'failed',
      error: statusData.data?.error || statusData.error || 'Atlas generation failed',
    };
  }

  return { status: status || 'processing' };
}

// ─── Main handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { predictionId, provider } = await req.json();

    if (!predictionId) {
      return NextResponse.json({ error: 'Missing predictionId' }, { status: 400 });
    }

    // Default to atlas for backwards compatibility with existing polls
    const videoProvider = provider === 'runpod' ? 'runpod' : 'atlas';

    let result: { status: string; video_url?: string; error?: string };

    if (videoProvider === 'runpod') {
      result = await checkRunPodVideoStatus(predictionId);
    } else {
      result = await checkAtlasVideoStatus(predictionId);
    }

    if (result.status === 'succeeded' && result.video_url) {
      // Wrap Atlas URLs in proxy; RunPod/Supabase URLs are already public
      const finalUrl =
        videoProvider === 'atlas' && result.video_url.startsWith('http')
          ? `/api/video-proxy?url=${encodeURIComponent(result.video_url)}`
          : result.video_url;

      return NextResponse.json({
        success: true,
        status: result.status,
        video_url: finalUrl,
      });
    }

    if (result.status === 'failed') {
      return NextResponse.json(
        { status: 'failed', error: result.error || 'Video generation failed' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: false, status: result.status });
  } catch (error) {
    console.error('Video status error:', error);
    return NextResponse.json({ error: 'Video status failed' }, { status: 500 });
  }
}
