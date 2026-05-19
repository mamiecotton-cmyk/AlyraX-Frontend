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

type ComfyOutput = [string, number] | string;
type ComfyWorkflowNode = {
  class_type: string;
  inputs: Record<string, ComfyOutput | number | string>;
};
type ComfyWorkflow = Record<string, ComfyWorkflowNode>;

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

function getSubjectNegative(gender: unknown, structuredPrompt?: StructuredPrompt) {
  const parts: string[] = [];
  const effectiveGender = structuredPrompt?.gender || gender;
  const race = cleanPromptPart(structuredPrompt?.race).toLowerCase();

  if (effectiveGender === 'F') {
    parts.push('man', 'male', 'masculine face', 'beard', 'mustache');
  } else if (effectiveGender === 'M') {
    parts.push('woman', 'female', 'feminine face', 'breasts');
  }

  if (race.includes('black') || race.includes('african')) {
    parts.push('white person', 'caucasian', 'european features', 'wrong ethnicity');
  }

  return parts.join(', ');
}

function normalizeComfyUrl(value: string) {
  return value.replace(/\/+$/, '');
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getComfyCheckpoint() {
  return process.env.COMFYUI_CHECKPOINT || 'model_974693_2831949.safetensors';
}

function getRunPodComfyEndpointId() {
  return process.env.RUNPOD_COMFYUI_ENDPOINT_ID;
}

function getImageGenerationProvider() {
  return (process.env.IMAGE_GENERATION_PROVIDER || '').trim().toLowerCase().replace(/_/g, '-');
}

function isComfyCheckpointValidationError(error: string) {
  const normalized = error.toLowerCase();
  return normalized.includes('checkpoint') || normalized.includes('ckpt_name') || normalized.includes('value_not_in_list');
}

async function submitRunPodImage({
  prompt,
  negative,
  numInferenceSteps,
  guidanceScale,
  width,
  height,
  seed,
  referenceImageUrl,
  referenceStrength,
  denoiseStrength,
}: {
  prompt: string;
  negative: string;
  numInferenceSteps: number;
  guidanceScale: number;
  width: number;
  height: number;
  seed: number;
  referenceImageUrl?: string;
  referenceStrength: number;
  denoiseStrength?: number;
}) {
  const imageEndpointId = process.env.RUNPOD_IMAGE_ENDPOINT_ID;
  if (!imageEndpointId) {
    return NextResponse.json({ error: 'Missing RUNPOD_IMAGE_ENDPOINT_ID' }, { status: 500 });
  }

  console.log('Using RUNPOD_IMAGE_ENDPOINT_ID:', imageEndpointId);
  const workflow = buildComfySdxlWorkflow({
    prompt,
    negative,
    width,
    height,
    seed,
    steps: numInferenceSteps,
    cfg: guidanceScale,
  });

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
          workflow,
          prompt,
          negative_prompt: negative,
          num_inference_steps: numInferenceSteps,
          guidance_scale: guidanceScale,
          width,
          height,
          seed,
          reference_image_url: referenceImageUrl,
          reference_strength: referenceStrength,
          denoise_strength: denoiseStrength,
        }
      }),
    }
  );

  if (!runpodResponse.ok) {
    const error = await runpodResponse.text();
    console.error('RunPod submit error:', error);
    return NextResponse.json({ error: 'Submission failed', detail: error }, { status: 500 });
  }

  const { id: jobId } = await runpodResponse.json();
  console.log('Job submitted:', jobId);

  return NextResponse.json({
    jobId: `runpod-image:${jobId}`,
    seed,
    prompt_preview: prompt.slice(0, 500),
    message: 'Job submitted; poll /api/generate-companion/status/[jobId] for updates',
  }, { status: 202 });
}

function buildComfySdxlWorkflow({
  prompt,
  negative,
  width,
  height,
  seed,
  steps,
  cfg,
}: {
  prompt: string;
  negative: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
  cfg: number;
}): ComfyWorkflow {
  const resolvedSeed = seed >= 0 ? seed : Math.floor(Math.random() * 2 ** 32);

  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: getComfyCheckpoint(),
      },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: prompt,
        clip: ['1', 1],
      },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: negative,
        clip: ['1', 1],
      },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width,
        height,
        batch_size: 1,
      },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: resolvedSeed,
        steps,
        cfg,
        sampler_name: process.env.COMFYUI_SAMPLER || 'dpmpp_2m',
        scheduler: process.env.COMFYUI_SCHEDULER || 'karras',
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['5', 0],
        vae: ['1', 2],
      },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'alyrax',
        images: ['6', 0],
      },
    },
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
      denoise_strength,
      reference_mode = 'identity',
      structured_prompt,
    } = await req.json();

    const { width: defaultWidth, height: defaultHeight, composition, negative: styleNegative } = getImageSettings(style);
    const width = widthOverride ?? defaultWidth;
    const height = heightOverride ?? defaultHeight;
    const effectiveDenoiseStrength = reference_image_url ? denoise_strength ?? 0.76 : undefined;

    // Merge negative prompts (server style negatives + client-provided negatives)
    const negative = [styleNegative, getSubjectNegative(gender, structured_prompt), incomingNegative].filter(Boolean).join(', ');
    const prompt = buildCompactPrompt({
      description: cleanPromptPart(description),
      style,
      gender,
      referenceMode: reference_mode,
      hasReference: Boolean(reference_image_url),
      structuredPrompt: structured_prompt,
    });

    const provider = getImageGenerationProvider();
    console.log('Generating image with', { provider, style, composition, width, height, gender, seed, reference_mode, reference_strength, denoise_strength: effectiveDenoiseStrength, hasReference: Boolean(reference_image_url), structuredPrompt: hasStructuredPrompt(structured_prompt), promptPreview: prompt.slice(0, 500), negativePreview: negative.slice(0, 300) });

    if (provider === 'comfyui') {
      const comfyUrl = process.env.COMFYUI_BASE_URL;
      if (!comfyUrl) {
        return NextResponse.json({ error: 'Missing COMFYUI_BASE_URL' }, { status: 500 });
      }

      const comfyResponse = await fetch(`${normalizeComfyUrl(comfyUrl)}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: buildComfySdxlWorkflow({
            prompt,
            negative,
            width,
            height,
            seed,
            steps: num_inference_steps,
            cfg: guidance_scale,
          }),
        }),
      });

      if (!comfyResponse.ok) {
        const error = await comfyResponse.text();
        console.error('ComfyUI submit error:', error);
        return NextResponse.json({ error: 'ComfyUI submission failed', detail: error }, { status: 500 });
      }

      const comfyData = await comfyResponse.json();
      return NextResponse.json({
        jobId: `comfy:${comfyData.prompt_id}`,
        seed,
        prompt_preview: prompt.slice(0, 500),
        message: 'ComfyUI job submitted; poll /api/generate-companion/status/[jobId] for updates',
      }, { status: 202 });
    }

    if (provider === 'runpod-comfyui' || provider === 'runpod-comfy' || provider === 'comfy-runpod') {
      const comfyEndpointId = getRunPodComfyEndpointId();
      if (!comfyEndpointId) {
        return NextResponse.json({ error: 'Missing RUNPOD_COMFYUI_ENDPOINT_ID' }, { status: 500 });
      }

      const workflow = buildComfySdxlWorkflow({
        prompt,
        negative,
        width,
        height,
        seed,
        steps: num_inference_steps,
        cfg: guidance_scale,
      });

      console.log('Submitting RunPod ComfyUI image workflow', {
        endpointId: comfyEndpointId,
        checkpoint: getComfyCheckpoint(),
        workflowNodes: Object.keys(workflow).length,
      });

      const runpodResponse = await fetch(
        `https://api.runpod.ai/v2/${comfyEndpointId}/run`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
          },
          body: JSON.stringify({
            input: {
              workflow,
            },
          }),
        }
      );

      if (!runpodResponse.ok) {
        const error = await runpodResponse.text();
        console.error('RunPod ComfyUI submit error:', error);
        const message = isComfyCheckpointValidationError(error)
          ? 'RunPod ComfyUI checkpoint validation failed. Check that COMFYUI_CHECKPOINT is installed on RUNPOD_COMFYUI_ENDPOINT_ID.'
          : 'RunPod ComfyUI submission failed';
        return NextResponse.json({ error: message, detail: error }, { status: 500 });
      }

      const { id: jobId } = await runpodResponse.json();
      console.log('RunPod ComfyUI image job submitted:', { endpointId: comfyEndpointId, jobId });
      return NextResponse.json({
        jobId: `runpod-comfy:${jobId}`,
        seed,
        prompt_preview: prompt.slice(0, 500),
        message: 'RunPod ComfyUI job submitted; poll /api/generate-companion/status/[jobId] for updates',
      }, { status: 202 });
    }

    return submitRunPodImage({
      prompt,
      negative,
      numInferenceSteps: num_inference_steps,
      guidanceScale: guidance_scale,
      width,
      height,
      seed,
      referenceImageUrl: reference_image_url,
      referenceStrength: reference_strength,
      denoiseStrength: effectiveDenoiseStrength,
    });

  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json({ error: 'Generation failed', detail: getErrorMessage(error) }, { status: 500 });
  }
}
