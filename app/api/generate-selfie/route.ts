import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

function buildInstantIDWorkflow(
  faceImageBase64: string,
  prompt: string,
  negativePrompt: string,
  seed: number,
) {
  return {
    '1': {
      class_type: 'InstantID',
      inputs: {
        control_net_name: 'instantid_controlnet.safetensors',
        ip_adapter_file: 'instantid_ip_adapter.bin',
        image: faceImageBase64,
        model: ['2', 0],
        positive: ['3', 0],
        negative: ['4', 0],
        image_kps: ['5', 0],
        face_embeds: ['5', 1],
        ip_adapter_scale: 0.8,
        control_net_conditioning_scale: 0.8,
        start_at: 0.0,
        end_at: 1.0,
      },
    },
    '2': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: process.env.COMFYUI_CHECKPOINT || 'realismIllustriousBy_v55FP16.safetensors',
      },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: prompt,
        clip: ['2', 1],
      },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: negativePrompt,
        clip: ['2', 1],
      },
    },
    '5': {
      class_type: 'InstantIDFaceAnalysis',
      inputs: {
        provider: 'CUDA',
        image: faceImageBase64,
      },
    },
    '6': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: 768,
        height: 1024,
        batch_size: 1,
      },
    },
    '7': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: 30,
        cfg: 7.5,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        denoise: 1,
        model: ['1', 0],
        positive: ['1', 1],
        negative: ['1', 2],
        latent_image: ['6', 0],
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['7', 0],
        vae: ['2', 2],
      },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'alyrax-selfie',
        images: ['8', 0],
      },
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const { face_image_url, prompt, negative_prompt } = await req.json();

    if (!face_image_url || !prompt) {
      return NextResponse.json({ error: 'Missing face_image_url or prompt' }, { status: 400 });
    }

    const endpointId = process.env.RUNPOD_INSTANTID_ENDPOINT_ID;
    const apiKey = process.env.RUNPOD_API_KEY;

    if (!endpointId || !apiKey) {
      return NextResponse.json({ error: 'Missing RunPod config' }, { status: 500 });
    }

    // Fetch the face image and convert to base64
    const imageRes = await fetch(face_image_url);
    if (!imageRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch face image' }, { status: 500 });
    }
    const imageBuffer = await imageRes.arrayBuffer();
    const faceImageBase64 = Buffer.from(imageBuffer).toString('base64');

    const negPrompt = negative_prompt || 'cartoon, anime, illustration, deformed, ugly, blurry, watermark, text, bad anatomy';
    const seed = Math.floor(Math.random() * 2 ** 32);
    const workflow = buildInstantIDWorkflow(faceImageBase64, prompt, negPrompt, seed);

    // Submit to RunPod
    const submitRes = await fetch(
      `https://api.runpod.ai/v2/${endpointId}/run`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input: { workflow } }),
      }
    );

    if (!submitRes.ok) {
      const error = await submitRes.text();
      console.error('InstantID submit error:', error);
      return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
    }

    const { id: jobId } = await submitRes.json();

    // Poll for result
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise(r => setTimeout(r, 3000));

      const statusRes = await fetch(
        `https://api.runpod.ai/v2/${endpointId}/status/${jobId}`,
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
      );

      const statusData = await statusRes.json();

      if (statusData.status === 'COMPLETED') {
        // Upload to R2
        const output = statusData.output;
        const imageData = Array.isArray(output?.images)
          ? output.images[0]
          : output;

        const base64 = imageData?.data || imageData?.image || '';
        if (!base64) {
          return NextResponse.json({ error: 'No image in response' }, { status: 500 });
        }

        const imageBuffer = Buffer.from(base64, 'base64');

        // Upload to R2
        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
          },
          forcePathStyle: true,
        });

        const fileName = `selfies/${Date.now()}-${jobId}.png`;
        await s3.send(new PutObjectCommand({
          Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
          Key: fileName,
          Body: imageBuffer,
          ContentType: 'image/png',
        }));

        const imageUrl = `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${fileName}`;
        return NextResponse.json({ image_url: imageUrl, success: true });
      }

      if (statusData.status === 'FAILED') {
        return NextResponse.json(
          { error: statusData.error || 'Generation failed' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: 'Selfie generation timed out' }, { status: 504 });

  } catch (error) {
    console.error('Selfie generation error:', error);
    return NextResponse.json({ error: 'Selfie generation failed' }, { status: 500 });
  }
}