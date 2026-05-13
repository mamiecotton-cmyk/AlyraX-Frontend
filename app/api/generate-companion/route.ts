import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

function getImageSettings(style: string) {
  const baseNegative = [
    'ugly',
    'deformed',
    'blurry',
    'low quality',
    'cartoon',
    'anime',
    'bad anatomy',
    'watermark',
    'text',
    'extra limbs',
    'missing limbs',
    'mutated hands',
    'poorly drawn face',
    'different person',
    'changed identity',
    'wrong age',
    'wrong face',
    'deformed feet',
    'mutated feet',
    'bad toes',
    'extra toes',
    'missing toes',
    'twisted ankles',
    'floating feet',
  ].join(', ');

  if (style === 'fullbody') {
    return {
      width: 832,
      height: 1216,
      composition: 'full-body vertical portrait, head-to-toe visible, face visible, both arms visible, both legs visible, both feet grounded, balanced natural standing posture, neutral studio background',
      negative: `${baseNegative}, cropped head, cropped face, cropped feet, cropped legs, out of frame, close-up, extreme close-up`,
    };
  }

  if (style === 'fullscreen') {
    return {
      width: 768,
      height: 1344,
      composition: 'vertical full-scene image, subject clearly visible, full body in frame when possible, physically plausible pose, coherent environment, no cropped limbs',
      negative: `${baseNegative}, tiny subject, empty frame, cropped head, cropped face, cropped body, cropped feet, awkward framing, horizontal crop, out of frame`,
    };
  }

  return {
    width: 768,
    height: 1024,
    composition: 'waist-up portrait, centered, face visible, shoulders visible, natural neck and shoulders, relaxed natural arms',
    negative: `${baseNegative}, side profile, back view, turned away, full body, extreme close-up, cropped head, cropped face, cropped shoulders, cropped torso, cropped arms, out of frame`,
  };
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function getPoseInstruction(style: string) {
  if (style === 'portrait') {
    return 'natural shoulders, relaxed portrait pose';
  }

  return 'natural pose, correct shoulders, aligned torso and hips, grounded feet';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      description,
      style = 'portrait',
      num_inference_steps = 28,
      guidance_scale = 7.0,
      reference_image_url,
      reference_strength = 0.23,
      denoise_strength,
      reference_mode = 'identity',
      companionId,
    } = body;
    let seed = typeof body.seed === 'number' ? body.seed : -1;

    // Keep the original companion seed only for unanchored generations.
    // Anchored img2img generations need fresh/requested seeds so the prompt can actually steer the result.
    if (companionId && !reference_image_url) {
      try {
        const { createClient } = await import('@/lib/supabase-server');
        const supabase = await createClient();
        const { data: companionRow } = await supabase
          .from('companions')
          .select('prompt_used')
          .eq('id', companionId)
          .maybeSingle();

        if (companionRow?.prompt_used) {
          try {
            const meta = JSON.parse(companionRow.prompt_used);
            if (meta && typeof meta.generation_seed === 'number' && !Number.isNaN(meta.generation_seed)) {
              seed = meta.generation_seed;
            }
          } catch {
            // ignore parse errors
          }
        }
      } catch (e) {
        console.warn('Failed to read companion seed for DNA lock:', e);
      }
    }

    const { width, height, composition, negative } = getImageSettings(style);
    const safeSteps = Math.round(clampNumber(num_inference_steps, 28, 18, 40));
    const safeGuidance = clampNumber(guidance_scale, 7.0, 4.0, 9.0);

    const referenceInstruction = reference_image_url && reference_mode !== 'inspiration'
      ? 'same person as reference image'
      : '';

    const poseInstruction = getPoseInstruction(style);
    const anatomyInstruction = 'realistic anatomy, correct hands, correct feet, no extra limbs';

    const qualityTags = 'photorealistic, realistic skin texture, sharp natural focus';

    const prompt = [
      referenceInstruction,
      description,
      composition,
      poseInstruction,
      anatomyInstruction,
      qualityTags,
    ].filter(Boolean).join(', ');

    // Submit job async
    const imageEndpointId = process.env.RUNPOD_IMAGE_ENDPOINT_ID;
    console.log('Using RUNPOD_IMAGE_ENDPOINT_ID:', imageEndpointId);
    console.log('Submitting image job:', JSON.stringify({
      style,
      seed,
      promptLength: prompt.length,
      hasReference: Boolean(reference_image_url),
      referencePreview: typeof reference_image_url === 'string' ? reference_image_url.slice(0, 120) : '',
      reference_strength,
      denoise_strength,
    }));

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
            num_inference_steps: safeSteps,
            guidance_scale: safeGuidance,
            width,
            height,
            seed,
            reference_image_url,
            reference_strength,
            denoise_strength,
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
