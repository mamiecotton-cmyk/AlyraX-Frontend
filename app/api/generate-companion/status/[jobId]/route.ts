import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type ComfyImage = {
  filename?: string;
  subfolder?: string;
  type?: string;
};

type ComfyOutput = {
  images?: ComfyImage[];
};

type RunPodImageOutput = {
  data?: string;
  image?: string;
  base64?: string;
  url?: string;
  s3_url?: string;
  type?: string;
};

function normalizeComfyUrl(value: string) {
  return value.replace(/\/+$/, '');
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getRunPodImageEndpointId() {
  return process.env.RUNPOD_IMAGE_ENDPOINT_ID;
}

function getRunPodComfyImageEndpointId() {
  return process.env.RUNPOD_COMFYUI_ENDPOINT_ID;
}

function getImageGenerationProvider() {
  return (process.env.IMAGE_GENERATION_PROVIDER || '').trim().toLowerCase().replace(/_/g, '-');
}

function resolveRunPodStatusTarget(jobId: string) {
  if (jobId.startsWith('runpod-image:')) {
    return {
      endpointId: process.env.RUNPOD_IMAGE_ENDPOINT_ID,
      runpodJobId: jobId.slice('runpod-image:'.length),
      missingMessage: 'Missing RUNPOD_IMAGE_ENDPOINT_ID',
    };
  }

  if (jobId.startsWith('runpod-comfy:')) {
    return {
      endpointId: getRunPodComfyImageEndpointId(),
      runpodJobId: jobId.slice('runpod-comfy:'.length),
      missingMessage: 'Missing RUNPOD_COMFYUI_ENDPOINT_ID',
    };
  }

  const provider = getImageGenerationProvider();
  const isRunPodComfy = provider === 'runpod-comfyui' || provider === 'runpod-comfy' || provider === 'comfy-runpod';
  const endpointId = isRunPodComfy
    ? getRunPodComfyImageEndpointId()
    : getRunPodImageEndpointId();

  return {
    endpointId,
    runpodJobId: jobId,
    missingMessage: isRunPodComfy
      ? 'Missing RUNPOD_COMFYUI_ENDPOINT_ID'
      : 'Missing RUNPOD_IMAGE_ENDPOINT_ID',
  };
}

function getImagePayload(output: unknown) {
  if (typeof output === 'string' && output.length > 0) {
    return output.startsWith('http') ? { url: output } : { base64: output };
  }

  if (Array.isArray(output)) {
    return getImagePayload(output[0]);
  }

  const outputObj = typeof output === 'object' && output !== null ? output as Record<string, unknown> : undefined;

  const legacyImage = typeof outputObj?.image === 'string' ? outputObj.image : '';
  if (legacyImage) return legacyImage.startsWith('http') ? { url: legacyImage } : { base64: legacyImage };

  const directData =
    (typeof outputObj?.data === 'string' ? outputObj.data : '') ||
    (typeof outputObj?.base64 === 'string' ? outputObj.base64 : '') ||
    (typeof outputObj?.url === 'string' ? outputObj.url : '') ||
    (typeof outputObj?.s3_url === 'string' ? outputObj.s3_url : '');
  if (directData) {
    return directData.startsWith('http') || outputObj?.type === 's3_url'
      ? { url: directData }
      : { base64: directData };
  }

  const message = typeof outputObj?.message === 'string' ? outputObj.message : '';
  if (message) {
    return message.startsWith('http') ? { url: message } : { base64: message };
  }

  const images = Array.isArray(outputObj?.images) ? outputObj.images : [];
  const firstImage = images[0] as string | RunPodImageOutput | undefined;

  if (typeof firstImage === 'string') {
    return firstImage.startsWith('http') ? { url: firstImage } : { base64: firstImage };
  }

  const data = firstImage?.data || firstImage?.image || firstImage?.base64 || '';
  if (data) {
    return data.startsWith('http') || firstImage?.type === 's3_url'
      ? { url: data }
      : { base64: data };
  }

  const url = firstImage?.url || firstImage?.s3_url || '';
  if (url) return { url };

  return {};
}

function base64ToBuffer(value: string) {
  const base64 = value.includes(',') ? value.split(',').pop() ?? '' : value;
  return Buffer.from(base64, 'base64');
}

async function uploadImageBuffer(imageBuffer: Buffer, jobId: string, raw: unknown, seed?: number, width?: number, height?: number) {
  const { createClient } = await import('@/lib/supabase-server');
  const supabase = await createClient();

  const fileName = `generated/${Date.now()}-${jobId.replace(/[^a-zA-Z0-9_-]/g, '-')}.png`;

  const uploadRes = await supabase.storage
    .from('companions')
    .upload(fileName, imageBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (uploadRes.error) {
    console.error('Supabase upload error:', uploadRes.error);
    return NextResponse.json({
      image_url: `data:image/png;base64,${imageBuffer.toString('base64')}`,
      success: true,
      seed,
      width,
      height,
      raw,
    });
  }

  const { data: urlData } = supabase.storage
    .from('companions')
    .getPublicUrl(fileName);

  return NextResponse.json({
    image_url: urlData.publicUrl,
    success: true,
    seed,
    width,
    height,
    raw,
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    if (jobId.startsWith('comfy:')) {
      const comfyUrl = process.env.COMFYUI_BASE_URL;
      if (!comfyUrl) {
        return NextResponse.json({ error: 'Missing COMFYUI_BASE_URL' }, { status: 500 });
      }

      const promptId = jobId.slice('comfy:'.length);
      const baseUrl = normalizeComfyUrl(comfyUrl);
      const historyResponse = await fetch(`${baseUrl}/history/${promptId}`);

      if (!historyResponse.ok) {
        const err = await historyResponse.text();
        console.error('ComfyUI history error:', err);
        return NextResponse.json({ error: 'Failed to fetch ComfyUI status' }, { status: 502 });
      }

      const historyData = await historyResponse.json();
      const promptHistory = historyData[promptId];

      if (!promptHistory) {
        return NextResponse.json({ status: 'IN_QUEUE' });
      }

      if (promptHistory.status?.status_str === 'error') {
        return NextResponse.json({ error: 'ComfyUI generation failed', detail: promptHistory.status?.messages?.[0], raw: historyData }, { status: 500 });
      }

      const outputs = Object.values((promptHistory.outputs ?? {}) as Record<string, ComfyOutput>);
      const image = outputs.flatMap((output) => output.images ?? [])[0];

      if (!image?.filename) {
        return NextResponse.json({ status: 'PROCESSING', raw: historyData });
      }

      const viewUrl = new URL(`${baseUrl}/view`);
      viewUrl.searchParams.set('filename', image.filename);
      viewUrl.searchParams.set('subfolder', image.subfolder ?? '');
      viewUrl.searchParams.set('type', image.type ?? 'output');

      const imageResponse = await fetch(viewUrl);
      if (!imageResponse.ok) {
        const err = await imageResponse.text();
        console.error('ComfyUI image fetch error:', err);
        return NextResponse.json({ error: 'Failed to fetch ComfyUI image' }, { status: 502 });
      }

      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      return uploadImageBuffer(imageBuffer, jobId, historyData);
    }

    const { endpointId: imageEndpointId, runpodJobId, missingMessage } = resolveRunPodStatusTarget(jobId);

    if (!imageEndpointId) {
      return NextResponse.json({ error: missingMessage }, { status: 500 });
    }

    const statusResponse = await fetch(
      `https://api.runpod.ai/v2/${imageEndpointId}/status/${runpodJobId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
        },
      }
    );

    if (!statusResponse.ok) {
      const err = await statusResponse.text();
      console.error('RunPod status proxy error:', err);
      return NextResponse.json({ error: 'Failed to fetch status' }, { status: 502 });
    }

    const statusData = await statusResponse.json();
    console.log(`Job ${jobId} full status response:`, JSON.stringify(statusData));

    const runpodError = statusData.error ?? statusData.output?.error;
    if (runpodError) {
      console.error('RunPod generation error:', runpodError);
      return NextResponse.json({ error: runpodError, raw: statusData }, { status: 500 });
    }

    if (statusData.status === 'FAILED') {
      return NextResponse.json({ error: statusData.status_message || 'RunPod image generation failed', raw: statusData }, { status: 500 });
    }

    // If completed, try to save the image to Supabase (same behavior as previous flow)
    if (statusData.status === 'COMPLETED') {
      const { base64, url } = getImagePayload(statusData.output);
      const outputSeed = statusData.output?.seed;
      const outputWidth = statusData.output?.width;
      const outputHeight = statusData.output?.height;

      if (!base64 && !url) {
        return NextResponse.json({ error: 'No image returned', raw: statusData }, { status: 500 });
      }

      try {
        let imageBuffer: Buffer;

        if (url) {
          const imageResponse = await fetch(url);
          if (!imageResponse.ok) {
            const err = await imageResponse.text();
            console.error('RunPod output image fetch error:', err);
            return NextResponse.json({ error: 'Failed to fetch generated image', detail: err, raw: statusData }, { status: 502 });
          }

          imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        } else {
          imageBuffer = base64ToBuffer(base64 ?? '');
        }

        return uploadImageBuffer(imageBuffer, jobId, statusData, outputSeed, outputWidth, outputHeight);
      } catch (err) {
        console.error('Error saving completed image:', err);
        return NextResponse.json({ success: true, raw: statusData });
      }
    }

    // Otherwise just proxy the status object
    return NextResponse.json(statusData);
  } catch (error) {
    console.error('Status proxy error:', error);
    return NextResponse.json({ error: 'Status check failed', detail: getErrorMessage(error) }, { status: 500 });
  }
}
