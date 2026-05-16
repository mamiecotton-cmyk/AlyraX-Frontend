import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

type StructuredPrompt = {
  race?: string;
  gender?: 'M' | 'F' | string;
  age?: string;
  wardrobe?: string;
  environment?: string;
  details?: string;
};

const HUMAN_REALISM = 'RAW candid DSLR photo, photorealistic human, natural skin pores, realistic eyes';

function cleanPromptPart(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').replace(/[.]+$/g, '').trim()
    : '';
}

function limitWords(value: string, maxWords: number) {
  return value.split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ');
}

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
    // Portrait uses a shorter canvas to reduce empty headroom.
    width: 768,
    height: 1024,
    composition: 'tight head-and-shoulders portrait, face fills upper frame, background close behind subject, no empty headroom',
    negative: `${baseNegative}, side profile, back view, turned away, full body, extreme close-up, cropped head, cropped face, cropped shoulders, cropped torso, cropped arms, out of frame, empty background, excessive headroom, tiny head, distant subject, blank wall`,
  };
}

function getShortComposition(style: string) {
  if (style === 'fullbody') return 'full body in frame';
  if (style === 'fullscreen') return 'vertical full screen scene';
  return 'tight head-and-shoulders portrait, no empty headroom';
}

function getGenderLabel(gender: unknown) {
  if (gender === 'M') return 'male';
  if (gender === 'F') return 'female';
  return cleanPromptPart(gender);
}

function normalizeAge(age: string) {
  if (!age) return '';
  if (/^age\b/i.test(age)) return age;
  return `age ${age}`;
}

function hasStructuredPrompt(fields?: StructuredPrompt) {
  if (!fields) return false;
  return Boolean(
    cleanPromptPart(fields.race) ||
    cleanPromptPart(fields.gender) ||
    cleanPromptPart(fields.age) ||
    cleanPromptPart(fields.wardrobe) ||
    cleanPromptPart(fields.environment) ||
    cleanPromptPart(fields.details),
  );
}

function buildCompactPrompt({
  description,
  style,
  gender,
  referenceMode,
  hasReference,
  structuredPrompt,
}: {
  description: string;
  style: string;
  gender?: string;
  referenceMode?: string;
  hasReference: boolean;
  structuredPrompt?: StructuredPrompt;
}) {
  const composition = getShortComposition(style);
  const manualDetails = cleanPromptPart(description);
  const referenceTag = hasReference
    ? referenceMode === 'inspiration'
      ? 'reference aesthetic'
      : 'same identity as reference'
    : '';

  if (hasStructuredPrompt(structuredPrompt)) {
    const identity = [
      cleanPromptPart(structuredPrompt?.race),
      getGenderLabel(structuredPrompt?.gender || gender),
      normalizeAge(cleanPromptPart(structuredPrompt?.age)),
    ].filter(Boolean).join(' ');

    return limitWords([
      identity,
      cleanPromptPart(structuredPrompt?.wardrobe),
      cleanPromptPart(structuredPrompt?.environment),
      cleanPromptPart(structuredPrompt?.details),
      manualDetails,
      referenceTag,
      HUMAN_REALISM,
      composition,
    ].filter(Boolean).join(', '), 55);
  }

  const genericGender = gender === 'M' ? 'adult male' : gender === 'F' ? 'adult female' : '';

  return limitWords([
    genericGender,
    manualDetails,
    referenceTag,
    HUMAN_REALISM,
    composition,
  ].filter(Boolean).join(', '), 55);
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
      structured_prompt,
    } = await req.json();

    const { width: defaultWidth, height: defaultHeight, composition, negative: styleNegative } = getImageSettings(style);
    const width = widthOverride ?? defaultWidth;
    const height = heightOverride ?? defaultHeight;

    // Merge negative prompts (server style negatives + client-provided negatives)
    const negative = [styleNegative, incomingNegative].filter(Boolean).join(', ');
    const prompt = buildCompactPrompt({
      description: cleanPromptPart(description),
      style,
      gender,
      referenceMode: reference_mode,
      hasReference: Boolean(reference_image_url),
      structuredPrompt: structured_prompt,
    });

    console.log('Generating image with', { style, composition, width, height, gender, seed, reference_mode, hasReference: Boolean(reference_image_url), structuredPrompt: hasStructuredPrompt(structured_prompt), promptPreview: prompt.slice(0, 500), negativePreview: negative.slice(0, 300) });

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
