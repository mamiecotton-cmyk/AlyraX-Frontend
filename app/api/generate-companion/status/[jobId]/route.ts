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
  return process.env.RUNPOD_COMFYUI_ENDPOINT_ID || process.env.RUNPOD_VIDEO_ENDPOINT_ID || process.env.RUNPOD_IMAGE_ENDPOINT_ID;
}

function getImagePayload(output: Record<string, unknown> | undefined) {
  const legacyImage = typeof output?.image === 'string' ? output.image : '';
  if (legacyImage) return { base64: legacyImage };

  const message = typeof output?.message === 'string' ? output.message : '';
  if (message) {
    return message.startsWith('http') ? { url: message } : { base64: message };
  }

  const images = Array.isArray(output?.images) ? output.images : [];
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

async function uploadImageToR2(imageBuffer: Buffer, jobId: string): Promise<string> {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID!;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!;
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL!;

  const fileName = `images/${Date.now()}-${jobId.replace(/[^a-zA-Z0-9_-]/g, '-')}.png`;
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const s3 = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
    Body: imageBuffer,
    ContentType: 'image/png',
  }));

  return `${publicUrl}/${fileName}`;
}

async function uploadImageBuffer(
  imageBuffer: Buffer,
  jobId: string,
  raw: unknown,
  seed?: number,
  width?: number,
  height?: number,
) {
  // Try R2 first (fast Cloudflare CDN)
  try {
    const imageUrl = await uploadImageToR2(imageBuffer, jobId);
    return NextResponse.json({
      image_url: imageUrl,
      success: true,
      seed,
      width,
      height,
      raw,
    });
  } catch (r2Error) {
    console.error('R2 upload failed, falling back to Supabase:', r2Error);
  }

  // Fallback to Supabase
  try {
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
  } catch (supabaseError) {
    console.error('Supabase fallback failed:', supabaseError);
    // Last resort — return as data URL
    return NextResponse.json({
      image_url: `data:image/png;base64,${imageBuffer.toString('base64')}`,
      success: true,
      seed,
      width,
      height,
      raw,
    });
  }
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
        return NextResponse.json(
          { error: 'ComfyUI generation failed', detail: promptHistory.status?.messages?.[0], raw: historyData },
          { status: 500 }
        );
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

    const imageEndpointId = getRunPodImageEndpointId();

    if (!imageEndpointId) {
      return NextResponse.json(
        { error: 'Missing RUNPOD_COMFYUI_ENDPOINT_ID or RUNPOD_IMAGE_ENDPOINT_ID' },
        { status: 500 }
      );
    }

    // Strip runpod-comfy: prefix if present
    const rawJobId = jobId.startsWith('runpod-comfy:')
      ? jobId.slice('runpod-comfy:'.length)
      : jobId;

    const statusResponse = await fetch(
      `https://api.runpod.ai/v2/${imageEndpointId}/status/${rawJobId}`,
      {
        headers: { 'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}` },
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
      return NextResponse.json(
        { error: statusData.status_message || 'RunPod image generation failed', raw: statusData },
        { status: 500 }
      );
    }

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
            return NextResponse.json(
              { error: 'Failed to fetch generated image', detail: err, raw: statusData },
              { status: 502 }
            );
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

    return NextResponse.json(statusData);
  } catch (error) {
    console.error('Status proxy error:', error);
    return NextResponse.json(
      { error: 'Status check failed', detail: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
