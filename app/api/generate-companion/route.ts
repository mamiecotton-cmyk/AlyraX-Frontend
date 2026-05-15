import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

function getImageSettings(style: string) {
  const baseNegative = 'ugly, deformed, blurry, low quality, cartoon, anime, bad anatomy, watermark, text, extra limbs, missing limbs, mutated hands, poorly drawn face';

  if (style === 'fullbody') {
    return {
      // Increased to higher resolution for crisper full-body renders
      width: 1536,
      height: 2048,
      composition: 'full body shot, head to toe visible, entire body fully in frame, feet visible, no cropping, neutral studio background',
      negative: `${baseNegative}, cropped head, cropped face, cropped feet, cropped legs, out of frame, close-up, extreme close-up`,
    };
  }

  if (style === 'fullscreen') {
    return {
      // Increased fullscreen resolution
      width: 1536,
      height: 2688,
      composition: 'full screen vertical cinematic scene, entire subject visible inside the frame, phone screen composition, subject clearly visible with environmental detail, no cropping',
      negative: `${baseNegative}, tiny subject, empty frame, cropped head, cropped face, cropped body, cropped feet, awkward framing, horizontal crop, out of frame`,
    };
  }

  return {
    // Portrait bumped to 1024x2048 for much higher fidelity
    width: 1024,
    height: 2048,
    composition: 'front-facing waist-up portrait, centered subject, looking directly at camera, face clearly visible, shoulders chest and waist visible, seductive elegant pose, hands naturally visible near torso, vertical profile image, enough room around upper body for animation',
    negative: `${baseNegative}, side profile, back view, turned away, full body, extreme close-up, cropped head, cropped face, cropped shoulders, cropped torso, cropped arms, out of frame`,
  };
}

export async function POST(req: NextRequest) {
  try {
    const {
      description,
      style = 'portrait',
      // Raise defaults to produce crisper outputs when callers omit these
      num_inference_steps = 35,
      guidance_scale = 7.5,
      seed = -1,
      reference_image_url,
      reference_strength = 0.25,
      reference_mode = 'identity',
    } = await req.json();

    const { width, height, composition, negative } = getImageSettings(style);

    // Optimized: Reduced fluff, focused on high-token impact
    const qualityTags = 'hyper-realistic, 8k uhd, professional studio lighting, sharp focus, masterpiece';

    // Condensed reference logic
    const refPrefix = reference_image_url && reference_mode === 'inspiration'
      ? 'inspired by reference image aesthetic, '
      : reference_image_url
        ? 'identity from reference image, '
        : '';

    // Final consolidated prompt
    const prompt = `${qualityTags}, ${refPrefix}${description}, ${composition}`;

    // Submit job async
    const imageEndpointId = process.env.RUNPOD_IMAGE_ENDPOINT_ID;
    console.log('Using RUNPOD_IMAGE_ENDPOINT_ID:', imageEndpointId);

    const runpodResponse = await fetch(
      `https://api.runpod.ai/v2/${imageEndpointId}/run`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
        },
        body: JSON.stringify({
          input: {
            prompt,
            negative_prompt: negative,
            num_inference_steps,
            guidance_scale,
            width,
            height,
            seed,
            reference_image_url,
            reference_strength,
          }
        }),
      }
    );

    if (!runpodResponse.ok) {
      const error = await runpodResponse.text();
      console.error('RunPod submit error:', error);
      return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
    }

    const { id: jobId } = await runpodResponse.json();
    console.log('Job submitted:', jobId);

    // Return 202 Accepted with job id — client can poll the status endpoint
    return NextResponse.json({
      jobId,
      message: 'Job submitted; poll /api/generate-companion/status/[jobId] for updates',
    }, { status: 202 });

  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
