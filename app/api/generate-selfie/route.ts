import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

function buildInstantIDWorkflow(
  faceImageUrl: string,
  prompt: string,
  negativePrompt: string,
  seed: number,
) {
  return {
    '1': {
      class_type: 'InstantIDModelLoader',
      inputs: {
        instantid_file: 'ip-adapter.bin',
      },
    },
    '2': {
      class_type: 'InstantIDFaceAnalysis',
      inputs: {
        provider: 'CUDA',
      },
    },
    '3': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: process.env.COMFYUI_CHECKPOINT || 'realismIllustriousBy_v55FP16.safetensors',
      },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: prompt,
        clip: ['3', 1],
      },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: negativePrompt,
        clip: ['3', 1],
      },
    },
    '6': {
      class_type: 'ControlNetLoader',
      inputs: {
        control_net_name: 'instantid_controlnet.safetensors',
      },
    },
    '7': {
      class_type: 'LoadImage',
      inputs: {
        image: faceImageUrl,
      },
    },
    '8': {
      class_type: 'ApplyInstantID',
      inputs: {
        instantid: ['1', 0],
        insightface: ['2', 0],
        control_net: ['6', 0],
        image: ['7', 0],
        model: ['3', 0],
        positive: ['4', 0],
        negative: ['5', 0],
        ip_weight: 0.8,
        cn_strength: 0.8,
        start_at: 0.0,
        end_at: 1.0,
        noise: 0.35,
      },
    },
    '9': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: 1016,
        height: 1016,
        batch_size: 1,
      },
    },
    '10': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: 30,
        cfg: 7.5,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        denoise: 1,
        model: ['8', 0],
        positive: ['8', 1],
        negative: ['8', 2],
        latent_image: ['9', 0],
      },
    },
    '11': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['10', 0],
        vae: ['3', 2],
      },
    },
    '12': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'alyrax-selfie',
        images: ['11', 0],
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

    const negPrompt = negative_prompt || 'cartoon, anime, illustration, deformed, ugly, blurry, watermark, text, bad anatomy';
    const seed = Math.floor(Math.random() * 2 ** 32);
    const workflow = buildInstantIDWorkflow(face_image_url, prompt, negPrompt, seed);

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
    console.log('InstantID job submitted:', jobId);

    // Poll for result
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise(r => setTimeout(r, 3000));

      const statusRes = await fetch(
        `https://api.runpod.ai/v2/${endpointId}/status/${jobId}`,
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
      );

      const statusData = await statusRes.json();
      console.log('InstantID status:', statusData.status, 'attempt:', attempt);

      if (statusData.status === 'COMPLETED') {
        const output = statusData.output;
        const images = Array.isArray(output?.images) ? output.images : [];
        const firstImage = images[0];
        const base64 = firstImage?.data || firstImage?.image || '';

        if (!base64) {
          console.error('No image data in response:', JSON.stringify(output));
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
        console.log('InstantID selfie saved:', imageUrl);
        return NextResponse.json({ image_url: imageUrl, success: true });
      }

      if (statusData.status === 'FAILED') {
        console.error('InstantID job failed:', statusData);
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