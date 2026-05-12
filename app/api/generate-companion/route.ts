import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

function getImageSettings(style: string) {
  const baseNegative = 'ugly, deformed, blurry, low quality, cartoon, anime, bad anatomy, watermark, text, extra limbs, missing limbs, mutated hands, poorly drawn face';

  if (style === 'fullbody') {
    return {
      width: 768,
      height: 1024,
      composition: 'full body shot, head to toe visible, entire body fully in frame, feet visible, no cropping, neutral studio background',
      negative: `${baseNegative}, cropped head, cropped face, cropped feet, cropped legs, out of frame, close-up, extreme close-up`,
    };
  }

  if (style === 'fullscreen') {
    return {
      width: 1024,
      height: 1792,
      composition: 'full screen vertical cinematic scene, entire subject visible inside the frame, phone screen composition, subject clearly visible with environmental detail, no cropping',
      negative: `${baseNegative}, tiny subject, empty frame, cropped head, cropped face, cropped body, cropped feet, awkward framing, horizontal crop, out of frame`,
    };
  }

  return {
    width: 512,
    height: 1024,
    composition: 'front-facing waist-up portrait, centered subject, looking directly at camera, face clearly visible, shoulders chest and waist visible, seductive elegant pose, hands naturally visible near torso, vertical profile image, enough room around upper body for animation',
    negative: `${baseNegative}, side profile, back view, turned away, full body, extreme close-up, cropped head, cropped face, cropped shoulders, cropped torso, cropped arms, out of frame`,
  };
}

export async function POST(req: NextRequest) {
  try {
    const {
      description,
      style = 'portrait',
      num_inference_steps = 20,
      guidance_scale = 3.5,
      seed = -1,
      reference_image_url,
      reference_strength = 0.25,
    } = await req.json();

    const { width, height, composition, negative } = getImageSettings(style);

    const qualityTags = 'photorealistic, highly detailed, professional photography, sharp focus, beautiful studio lighting, 8k uhd, masterpiece';
    const referenceInstruction = reference_image_url
      ? 'the reference image is the only source of truth for the woman, do not infer or rewrite age, ethnicity, face, hair, body size, or body proportions from text, only interpret requested wardrobe, action, location, camera, lighting, background, and additional people'
      : 'follow all requested character traits in the prompt, including age range, ethnicity, hair, eyes, body type, and style';

    const prompt = `${qualityTags}, ${description}, ${composition}, required action must be clearly visible, ${referenceInstruction}`;

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

    // Poll for result (max 4 minutes)
    let attempts = 0;
    const maxAttempts = 48;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusResponse = await fetch(
        `https://api.runpod.ai/v2/${imageEndpointId}/status/${jobId}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
          },
        }
      );

      const statusData = await statusResponse.json();
      console.log(`Job ${jobId} full status response:`, JSON.stringify(statusData));

      // Continue polling while job is queued or running
      if (
        statusData.status === 'IN_QUEUE' ||
        statusData.status === 'IN_PROGRESS'
      ) {
        attempts++;
        continue;
      }

      if (statusData.status === 'COMPLETED') {
        const imageBase64 = statusData.output?.image;
        const outputSeed = statusData.output?.seed;
        const outputWidth = statusData.output?.width ?? width;
        const outputHeight = statusData.output?.height ?? height;

        if (!imageBase64) {
          return NextResponse.json({ error: 'No image returned' }, { status: 500 });
        }

        // Save to Supabase Storage
        const { createClient } = await import('@/lib/supabase-server');
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const imageBuffer = Buffer.from(imageBase64, 'base64');
          const fileName = `${user.id}/${Date.now()}.png`;

          await supabase.storage
            .from('companions')
            .upload(fileName, imageBuffer, {
              contentType: 'image/png',
              upsert: true,
            });

          const { data: urlData } = supabase.storage
            .from('companions')
            .getPublicUrl(fileName);

          return NextResponse.json({
            image_url: urlData.publicUrl,
            success: true,
            seed: outputSeed,
            width: outputWidth,
            height: outputHeight,
          });
        }

        return NextResponse.json({
          image_url: `data:image/png;base64,${imageBase64}`,
          success: true,
          seed: outputSeed,
          width: outputWidth,
          height: outputHeight,
        });
      }

      if (statusData.status === 'FAILED') {
        console.error('Job failed — full response:', JSON.stringify(statusData));
        return NextResponse.json({ error: 'Generation failed', detail: statusData.error ?? statusData }, { status: 500 });
      }

      // Unknown status — log and keep polling
      console.warn(`Unexpected status: ${statusData.status}`, JSON.stringify(statusData));
      attempts++;
    }

    return NextResponse.json({ error: 'Generation timed out' }, { status: 504 });

  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
