import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

function getImageSettings(style: string) {
  const baseNegative = 'ugly, deformed, blurry, low quality, cartoon, anime, illustration, painting, sketch, stylized, low poly, toy, doll, clay, plastic, wax figure, mannequin, airbrushed skin, perfect skin, synthetic face, uncanny valley, AI generated, CGI, 3d render, watercolor, oil painting, pastel, bad anatomy, watermark, text, extra limbs, missing limbs, mutated hands, poorly drawn face';

  if (style === 'fullbody') {
    return {
      // Increased to higher resolution for crisper full-body renders
      width: 832,
      height: 1216,
      composition: 'full body shot, head to toe visible, entire body fully in frame, feet visible, no cropping, neutral studio background',
      negative: `${baseNegative}, cropped head, cropped face, cropped feet, cropped legs, out of frame, close-up, extreme close-up`,
    };
  }

  if (style === 'fullscreen') {
    return {
      // Fullscreen resolution (under 1,048,576 pixels)
      width: 768,
      height: 1344,
      composition: 'full screen vertical cinematic scene, entire subject visible inside the frame, phone screen composition, subject clearly visible with environmental detail, no cropping',
      negative: `${baseNegative}, tiny subject, empty frame, cropped head, cropped face, cropped body, cropped feet, awkward framing, horizontal crop, out of frame`,
    };
  }

  return {
    // Portrait capped to fit pixel limit
    width: 768,
    height: 1344,
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
      width: widthOverride,
      height: heightOverride,
      gender,
      negative_prompt: incomingNegative,
      reference_image_url,
      reference_strength = 0.25,
      reference_mode = 'identity',
    } = await req.json();

    const { width: defaultWidth, height: defaultHeight, composition, negative: styleNegative } = getImageSettings(style);
    const width = widthOverride ?? defaultWidth;
    const height = heightOverride ?? defaultHeight;

    // Optimized: emphasize real human photography and imperfect natural detail.
    const qualityTags = [
      'RAW documentary photograph',
      'photorealistic human portrait',
      'real person',
      'natural asymmetrical face',
      'visible skin pores',
      'subtle skin texture and imperfections',
      'natural hair texture',
      'realistic eyes',
      'professional camera photo',
      'sharp focus',
    ].join(', ');

    // Condensed reference logic
    const refPrefix = reference_image_url && reference_mode === 'inspiration'
      ? 'inspired by reference image aesthetic, '
      : reference_image_url
        ? 'identity from reference image, '
        : '';

    // Final consolidated prompt
    // Make the requested style explicit and place composition earlier in the prompt
    const styleTag = style === 'fullbody' ? 'full body shot, head to toe visible' : style === 'fullscreen' ? 'full screen vertical cinematic scene' : 'waist-up portrait';

    // Merge negative prompts (server style negatives + client-provided negatives)
    const negative = [styleNegative, incomingNegative].filter(Boolean).join(', ');

    // If client provided an explicit gender, add a short gender tag to help enforce sex/gender
    const genderTag = gender === 'M' ? 'real African American man, ' : gender === 'F' ? 'real African American woman, ' : '';

    const prompt = `${qualityTags}, ${styleTag}, ${composition}, ${genderTag}${refPrefix}${description}`;

    console.log('Generating image with', { style, styleTag, width, height, gender, seed, reference_mode, hasReference: Boolean(reference_image_url), promptPreview: prompt.slice(0, 500), negativePreview: negative.slice(0, 300) });

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
      seed,
      prompt_preview: prompt.slice(0, 500),
      message: 'Job submitted; poll /api/generate-companion/status/[jobId] for updates',
    }, { status: 202 });

  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
