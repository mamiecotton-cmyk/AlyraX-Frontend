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
  characterId?: string;
  pulidReference?: string;   // filename in /comfyui/input for PuLID face-lock
  pulidWeight?: number;
  pulidStartAt?: number;
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
  'lifelike photographic detail',
  'five fingers on each hand',
  'natural finger spacing',
  'five separate toes on each foot',
  'toes evenly spaced and cleanly separated',
  'feet flat and upright, soles down',
  'anatomically natural hands and feet',
].join(', ');

// Identity anchors injected at prompt position 1 — survive NSFW LoRA influence
const CHARACTER_ANCHORS: Record<string, string> = {
  soleil: 'honey golden blonde hair, vivid green eyes, deep ebony black skin blue-black undertones, slim modelesque figure, tall slender build, D cup breast size, soft confident smile',
  zara: 'long sleek honey blonde hair, heavy freckles on cheeks and nose, light honey caramel skin, curvy hourglass figure',
  jerome: 'honey-tipped dreadlocks, thin mustache and soul patch, tribal sleeve tattoo on right arm only clean left arm, athletic build',
  jaxon: 'adult Black man, medium-dark brown skin, shaved head low fade, light beard with goatee, strong jawline, sharp cheekbones, intense eyes, clean smooth skin no tattoos, lean muscular athletic build, tall proportional figure',
  roman: 'bright vivid blue eyes, heavy freckles across cheeks and nose, short tight waves low fade, lean athletic figure',
  nia: 'long dark wavy locs past shoulders, rich brown skin, warm brown eyes, natural curves, medium build',
  victoria: 'wavy silver-streaked hair past shoulders, warm caramel-brown skin, warm brown eyes, soft smile lines, natural 60-year-old woman\'s body, medium build, D cup breasts, natural flat stomach, soft mature curves',
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
  characterId,
  pulidReference,
  pulidWeight,
  pulidStartAt,
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

  const isMale = ['jerome', 'jaxon', 'roman'].includes(characterId ?? '');

  if (useNsfwLora) {
    if (isMale) {
      addLora('male_anatomy_flux.safetensors', Math.min(nsfwLoraStrength, 0.35));
      addLora('male_explicit_v2.safetensors', Math.min(nsfwLoraStrength, 0.25));
    } else {
      addLora('nsfw_flux_v2.safetensors', nsfwLoraStrength);
    }
  }
  addLora(loraFile, loraStrength);
  if (useNsfwLora && refinementLoraFile && refinementStrength) addLora(refinementLoraFile, refinementStrength);
  addLora('Show_Feet_-.safetensors', useNsfwLora && isMale ? 0.12 : 0.25);

  const modelOutput = currentModel;

  // --- PuLID face-lock: inserted after the LoRA chain ---
  const pulidNodes: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};
  let guiderModel: [string, number] = modelOutput;
  if (pulidReference) {
    pulidNodes['P1'] = { class_type: 'PulidFluxModelLoader', inputs: { pulid_file: 'pulid_flux_v0.9.1.safetensors' } };
    pulidNodes['P2'] = { class_type: 'PulidFluxEvaClipLoader', inputs: {} };
    pulidNodes['P3'] = { class_type: 'PulidFluxInsightFaceLoader', inputs: { provider: 'CUDA' } };
    pulidNodes['P4'] = { class_type: 'LoadImage', inputs: { image: pulidReference } };
    pulidNodes['P5'] = {
      class_type: 'ApplyPulidFlux',
      inputs: {
        model: modelOutput,
        pulid_flux: ['P1', 0],
        eva_clip: ['P2', 0],
        face_analysis: ['P3', 0],
        image: ['P4', 0],
        weight: pulidWeight ?? 0.7,
        start_at: pulidStartAt ?? 0.3,
        end_at: 1.0,
      },
    };
    guiderModel = ['P5', 0];
  }

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
    ...pulidNodes,
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
      inputs: { model: guiderModel, conditioning: ['6', 0] },
    },
    '9': {
      class_type: 'BasicScheduler',
      inputs: { model: guiderModel, scheduler: 'simple', steps, denoise: 1.0 },
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

function normalizeComfyUrl(value: string) {
  return value.replace(/\/+$/, '');
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
  return /\b(nude|naked|unclothed|not clothed|no clothes|no clothing|without clothes|clothes off|uncensored|nsfw|explicit|topless|shirtless|bare|intimate|penis)\b/i.test(prompt);
}

function buildFinalPrompt(prompt: string, triggerWord: string, style: ImageStyle, characterId?: string) {
  const promptWithoutTrigger = removeLeadingTriggerWord(prompt.trim(), triggerWord);
  const characterAnchor = characterId ? (CHARACTER_ANCHORS[characterId] ?? '') : '';
  const posePhrase = style === 'fullbody' || style === 'fullscreen'
    ? 'full body, full figure head to toe, feet visible in frame'
    : '';
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
          'wide full-length framing',
          'complete figure within the frame edges',
        ].join(', ')
      : 'portrait selfie composition';

  return [triggerWord, characterAnchor, posePhrase, promptWithoutTrigger, PHOTOREALISM_PROMPT, composition]
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
      explicit,
      pulid_weight,
      pulid_start_at,
    } = await req.json();

    if (!prompt || !lora_file || !trigger_word) {
      return NextResponse.json(
        { error: 'Missing required fields: prompt, lora_file, trigger_word' },
        { status: 400 }
      );
    }

    const comfyUrl = process.env.COMFYUI_BASE_URL;
    const endpointId = process.env.RUNPOD_COMFYUI_ENDPOINT_ID;
    const apiKey = process.env.RUNPOD_API_KEY;

    if (!comfyUrl && !endpointId) {
      return NextResponse.json(
        { error: 'Missing COMFYUI_BASE_URL or RUNPOD_COMFYUI_ENDPOINT_ID' },
        { status: 500 }
      );
    }

    if (!comfyUrl && !apiKey) {
      return NextResponse.json(
        { error: 'Missing RUNPOD_API_KEY' },
        { status: 500 }
      );
    }

    const imageStyle = normalizeStyle(style);
    const defaultLoraStrength = character_id === 'jaxon'
      ? 1
      : imageStyle === 'fullbody' || imageStyle === 'fullscreen'
        ? 0.65
        : 0.85;
    const effectiveLoraStrength = lora_strength ?? defaultLoraStrength;
    const useNsfwLora = typeof explicit === 'boolean' ? explicit : isExplicitContentPrompt(prompt);
    const archetypeLoraConfig = typeof character_id === 'string' ? getArchetypeLora(character_id) : null;
    const useExplicitCharacterLora = Boolean(useNsfwLora && archetypeLoraConfig?.explicitLoraFile);
    const charLoraFile = useExplicitCharacterLora
      ? archetypeLoraConfig?.explicitLoraFile ?? lora_file
      : lora_file;
    const charTrigger = useExplicitCharacterLora
      ? archetypeLoraConfig?.explicitTriggerWord ?? trigger_word
      : trigger_word;
    const finalPrompt = buildFinalPrompt(prompt, charTrigger, imageStyle, character_id);

    const { width, height } = styleToDimensions(imageStyle);
    const resolvedSeed =
      typeof seed === 'number' && seed >= 0
        ? seed
        : Math.floor(Math.random() * 2 ** 31);

    const workflow = buildFluxWorkflow({
      prompt: finalPrompt,
      loraFile: charLoraFile,
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
      characterId: typeof character_id === 'string' ? character_id : undefined,
      pulidReference: archetypeLoraConfig?.pulidReference,
      pulidWeight: pulid_weight,
      pulidStartAt: pulid_start_at,
    });

    console.log('Submitting Flux LoRA selfie:', {
      endpointId: comfyUrl ? null : endpointId,
      comfyUrl: comfyUrl ? normalizeComfyUrl(comfyUrl) : null,
      loraFile: charLoraFile,
      triggerWord: charTrigger,
      useExplicitCharacterLora,
      style: imageStyle,
      seed: resolvedSeed,
      useNsfwLora,
      loraStrength: effectiveLoraStrength,
      promptPreview: finalPrompt.slice(0, 200),
    });

    if (comfyUrl) {
      const comfyResponse = await fetch(`${normalizeComfyUrl(comfyUrl)}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow }),
      });

      if (!comfyResponse.ok) {
        const error = await comfyResponse.text();
        console.error('ComfyUI Flux submit error:', error);
        return NextResponse.json(
          { error: 'Flux generation submission failed', detail: error },
          { status: 500 }
        );
      }

      const comfyData = await comfyResponse.json();
      return NextResponse.json(
        {
          jobId: `comfy:${comfyData.prompt_id}`,
          seed: resolvedSeed,
          prompt_preview: finalPrompt.slice(0, 500),
        },
        { status: 202 }
      );
    }

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
