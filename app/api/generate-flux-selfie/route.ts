// app/api/generate-flux-selfie/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getArchetypeLora } from '@/lib/archetype-loras';

export const maxDuration = 60;

type FluxWorkflowParams = {
  prompt: string;
  loraFile: string;
  loraStrength: number;
  refinementLoraFile?: string;
  refinementStrength?: number;
  width: number;
  height: number;
  seed: number;
  steps: number;
  guidance: number;
  useNsfwLora: boolean;
  nsfwLoraStrength: number;
};

type ImageStyle = 'portrait' | 'fullbody' | 'fullscreen';

const PHOTOREALISM_PROMPT = [
  'RAW candid DSLR photo',
  'photorealistic human',
  'real person',
  'natural skin texture',
  'visible skin pores',
  'realistic eyes',
  'real camera photo',
  'not cartoon',
  'not anime',
  'not illustration',
  'not 3d render',
  'correct hands five fingers per hand',
  'correct feet five toes per foot',
  'anatomically correct hands and feet',
  'no extra fingers no missing fingers',
  'no jumbled feet no fused toes',
].join(', ');

// Identity anchors injected at prompt position 1 — survive NSFW LoRA influence
const CHARACTER_ANCHORS: Record<string, string> = {
  soleil: 'honey golden blonde hair, vivid green eyes, deep ebony black skin blue-black undertones, slim modelesque figure, tall slender build',
  zara: 'long sleek honey blonde hair, heavy freckles on cheeks and nose, light honey caramel skin, curvy hourglass figure',
  jerome: 'honey-tipped dreadlocks, thin mustache and soul patch, tribal sleeve tattoo on right arm only clean left arm, athletic build',
  jaxon: 'shaved head low fade, light beard with goatee, heavy gold cuban chain, clean smooth skin no tattoos, lean muscular athletic build, tall proportional figure',
  roman: 'bright vivid blue eyes, heavy freckles across cheeks and nose, short tight waves low fade, lean athletic figure',
  nia: 'long dark wavy locs past shoulders, rich brown skin, warm brown eyes, natural curves, medium build',
  victoria: 'wavy silver-streaked dark hair past shoulders, warm caramel-brown skin, warm brown eyes, soft smile lines',
};

function buildFluxWorkflow({
  prompt,
  loraFile,
  loraStrength,
  refinementLoraFile,
  refinementStrength,
  width,
  height,
  seed,
  steps,
  guidance,
  useNsfwLora,
  nsfwLoraStrength,
}: FluxWorkflowParams) {
  const loraNodes: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};
  let currentModel: [string, number] = ['1', 0];
  let loraIndex = 0;

  const addLora = (loraName: string, strength: number) => {
    loraIndex += 1;
    const id = `L${loraIndex}`;
    loraNodes[id] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: currentModel, lora_name: loraName, strength_model: strength },
    };
    currentModel = [id, 0];
  };

  if (useNsfwLora) addLora('nsfw_flux.safetensors', nsfwLoraStrength);
  addLora(loraFile, loraStrength);
  if (useNsfwLora && refinementLoraFile && refinementStrength) addLora(refinementLoraFile, refinementStrength);

  const modelOutput = currentModel;

  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: 'flux1-dev-fp8.safetensors',
        weight_dtype: 'fp8_e4m3fn',
      },
    },
    '2': {
      class_type: 'DualCLIPLoader',
      inputs: {
        clip_name1: 't5xxl_fp8_e4m3fn.safetensors',
        clip_name2: 'clip_l.safetensors',
        type: 'flux',
      },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: 'ae.safetensors' },
    },
    ...loraNodes,
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: { text: prompt, clip: ['2', 0] },
    },
    '6': {
      class_type: 'FluxGuidance',
      inputs: { conditioning: ['5', 0], guidance },
    },
    '7': {
      class_type: 'EmptySD3LatentImage',
      inputs: { width, height, batch_size: 1 },
    },
    '8': {
      class_type: 'BasicGuider',
      inputs: { model: modelOutput, conditioning: ['6', 0] },
    },
    '9': {
      class_type: 'BasicScheduler',
      inputs: { model: modelOutput, scheduler: 'simple', steps, denoise: 1.0 },
    },
    '10': {
      class_type: 'KSamplerSelect',
      inputs: { sampler_name: 'euler' },
    },
    '11': {
      class_type: 'RandomNoise',
      inputs: { noise_seed: seed },
    },
    '12': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['11', 0],
        guider: ['8', 0],
        sampler: ['10', 0],
        sigmas: ['9', 0],
        latent_image: ['7', 0],
      },
    },
    '13': {
      class_type: 'VAEDecode',
      inputs: { samples: ['12', 0], vae: ['3', 0] },
    },
    '14': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'flux_selfie', images: ['13', 0] },
    },
  };
}

function normalizeStyle(style: unknown): ImageStyle {
  if (style === 'fullscreen') return 'fullscreen';
  return style === 'fullbody' ? 'fullbody' : 'portrait';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeLeadingTriggerWord(prompt: string, triggerWord: string) {
  return prompt
    .replace(new RegExp(`^\\s*${escapeRegExp(triggerWord)}\\s*,?\\s*`, 'i'), '')
    .trim();
}

function isExplicitContentPrompt(prompt: string) {
  return /\b(nude|naked|unclothed|not clothed|no clothes|no clothing|without clothes|clothes off|uncensored|nsfw|explicit|topless|shirtless|bare|intimate)\b/i.test(prompt);
}

function buildFinalPrompt(prompt: string, triggerWord: string, style: ImageStyle, characterId?: string) {
  const promptWithoutTrigger = removeLeadingTriggerWord(prompt.trim(), triggerWord);
  const characterAnchor = characterId ? (CHARACTER_ANCHORS[characterId] ?? '') : '';
  const composition =
    style === 'fullbody' || style === 'fullscreen'
      ? [
          'full body shot',
          'head to toe visible',
          'entire body fully in frame',
          'legs visible',
          'feet visible',
          'standing far enough from camera',
          'feet near bottom of frame',
          'natural full-body photo composition',
          'not a close-up portrait',
          'not cropped',
        ].join(', ')
      : 'portrait selfie composition';

  return [promptWithoutTrigger, triggerWord, characterAnchor, PHOTOREALISM_PROMPT, composition]
    .filter(Boolean)
    .join(', ');
}

function styleToDimensions(style: ImageStyle) {
  if (style === 'fullbody') {
    return { width: 832, height: 1216 };
  }
  if (style === 'fullscreen') {
    return { width: 768, height: 1344 };
  }
  return { width: 1024, height: 1024 };
}

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      lora_file,
      trigger_word,
      style = 'portrait',
      seed,
      lora_strength,
      nsfw_lora_strength = 0.65,
      steps = 20,
      guidance = 3.5,
      character_id,
    } = await req.json();

    if (!prompt || !lora_file || !trigger_word) {
      return NextResponse.json(
        { error: 'Missing required fields: prompt, lora_file, trigger_word' },
        { status: 400 }
      );
    }

    const endpointId = process.env.RUNPOD_COMFYUI_ENDPOINT_ID;
    if (!endpointId) {
      return NextResponse.json(
        { error: 'Missing RUNPOD_COMFYUI_ENDPOINT_ID' },
        { status: 500 }
      );
    }

    const apiKey = process.env.RUNPOD_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing RUNPOD_API_KEY' },
        { status: 500 }
      );
    }

    const imageStyle = normalizeStyle(style);
    const effectiveLoraStrength = lora_strength ?? (imageStyle === 'fullbody' || imageStyle === 'fullscreen' ? 0.5 : 0.85);
    const finalPrompt = buildFinalPrompt(prompt, trigger_word, imageStyle, character_id);
    const useNsfwLora = isExplicitContentPrompt(prompt);

    const { width, height } = styleToDimensions(imageStyle);
    const resolvedSeed =
      typeof seed === 'number' && seed >= 0
        ? seed
        : Math.floor(Math.random() * 2 ** 31);

    const archetypeLoraConfig = typeof character_id === 'string' ? getArchetypeLora(character_id) : null;
    const workflow = buildFluxWorkflow({
      prompt: finalPrompt,
      loraFile: lora_file,
      loraStrength: effectiveLoraStrength,
      refinementLoraFile: archetypeLoraConfig?.refinementLoraFile,
      refinementStrength: archetypeLoraConfig?.refinementStrength,
      width,
      height,
      seed: resolvedSeed,
      steps,
      guidance,
      useNsfwLora,
      nsfwLoraStrength: nsfw_lora_strength,
    });

    console.log('Submitting Flux LoRA selfie:', {
      endpointId,
      loraFile: lora_file,
      triggerWord: trigger_word,
      style: imageStyle,
      seed: resolvedSeed,
      useNsfwLora,
      promptPreview: finalPrompt.slice(0, 200),
    });

    const runpodResponse = await fetch(
      `https://api.runpod.ai/v2/${endpointId}/run`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input: { workflow } }),
      }
    );

    if (!runpodResponse.ok) {
      const error = await runpodResponse.text();
      console.error('RunPod Flux submit error:', error);
      return NextResponse.json(
        { error: 'Flux generation submission failed', detail: error },
        { status: 500 }
      );
    }

    const { id: jobId } = await runpodResponse.json();
    console.log('Flux selfie job submitted:', { jobId });

    // Return with runpod-comfy: prefix so existing status endpoint handles polling
    return NextResponse.json(
      {
        jobId: `runpod-comfy:${jobId}`,
        seed: resolvedSeed,
        prompt_preview: finalPrompt.slice(0, 500),
      },
      { status: 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Flux selfie error:', error);
    return NextResponse.json(
      { error: 'Flux selfie generation failed', detail: message },
      { status: 500 }
    );
  }
}
