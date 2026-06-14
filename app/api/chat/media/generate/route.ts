import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { archetypes } from '@/lib/archetypes';
import { getArchetypeImagePrompt } from '@/lib/archetype-image-prompts';
import { getArchetypeLora } from '@/lib/archetype-loras';

export const maxDuration = 300;

function structuredPromptForArchetype(archetype: NonNullable<(typeof archetypes)[number]>) {
  const promptProfile = getArchetypeImagePrompt(archetype);
  return {
    race: promptProfile?.race ?? 'Black American',
    gender: archetype.gender,
    age: promptProfile?.age ?? String(archetype.age),
    wardrobe: '',
    environment: '',
    details: promptProfile?.details ?? `${archetype.style.toLowerCase()}, ${archetype.energy.toLowerCase()}`,
  };
}

function subjectNegativeForArchetype(
  archetype: NonNullable<(typeof archetypes)[number]>,
  prompt: string,
) {
  const wrongGender = archetype.gender === 'F'
    ? 'man, male, masculine face, beard, mustache'
    : 'woman, female, feminine face, breasts';
  const mirrorRequested = /\b(mirror selfie|mirror pic|mirror picture|mirror photo|in the mirror|bathroom mirror)\b/i.test(prompt);

  return [
    wrongGender,
    'white person',
    'caucasian',
    'european features',
    'wrong ethnicity',
    'wrong gender',
    'phone visible',
    'camera visible',
    'phone covering body',
    'camera covering body',
    'object blocking body',
    'hands covering body',
    'modesty cover',
    'strategically covered',
    'cropped body',
    'cropped legs',
    'cropped feet',
    ...(!mirrorRequested ? ['mirror selfie', 'mirror reflection', 'bathroom mirror', 'reflection shot'] : []),
  ].join(', ');
}

function styleForMediaPrompt(prompt: string) {
  return /\b(full body|full-body|fullbody|full length|full-length|head to toe|head-to-toe|entire body|whole body|body shot|outfit|fit check|legs?|standing|spread)\b/i.test(prompt)
    ? 'fullbody'
    : 'portrait';
}

export async function POST(req: NextRequest) {
  try {
    const { message_id, archetype_id, media_type, media_prompt } = await req.json();

    if (!message_id || !archetype_id || !media_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const archetype = archetypes.find(a => a.id === archetype_id);
    if (!archetype) return NextResponse.json({ error: 'Archetype not found' }, { status: 404 });

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://alyra-x-frontend.vercel.app';

    if (media_type === 'image') {
      // Get archetype main image for face reference
      const { data: imageData } = await supabase
        .from('archetype_images')
        .select('image_url')
        .eq('archetype_id', archetype_id)
        .maybeSingle();

      const imageStyle = styleForMediaPrompt(media_prompt);
      // NEW: Check if archetype has a trained Flux LoRA — if so, route to Flux pipeline
      const loraConfig = getArchetypeLora(archetype_id);
      if (loraConfig) {
        console.log('Routing to Flux LoRA pipeline for', archetype_id, loraConfig.loraFile);

        const fluxRes = await fetch(`${APP_URL}/api/generate-flux-selfie`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: media_prompt,
            lora_file: loraConfig.loraFile,
            trigger_word: loraConfig.triggerWord,
            style: imageStyle,
            character_id: archetype_id,
          }),
        });

        const fluxData = await fluxRes.json();
        if (!fluxRes.ok) {
          console.error('Flux selfie failed:', fluxData);
          await supabase
            .from('chat_messages')
            .update({ media_status: 'failed' })
            .eq('id', message_id);
          return NextResponse.json(
            { error: fluxData.error || 'Flux generation failed' },
            { status: 500 }
          );
        }

        return NextResponse.json({
          jobId: fluxData.jobId,
          message_id,
          status: 'generating',
        });
      }
      // END NEW
      const referenceImageUrl = imageData?.image_url || null;
      const promptAdherenceInstruction = [
        'highest priority: follow the user request exactly',
        'do not substitute a different pose, framing, camera setup, outfit, or scene',
        'only use mirror, phone, selfie, full-body, crop, clothing, or location details when the user requested them',
      ].join(', ');
      const fullBodyInstruction = imageStyle === 'fullbody'
        ? 'full body head to toe visible, entire body in frame, legs and feet visible, close facial match to the reference image, same face shape, same facial features, same identity as reference image, no phone or camera visible, no object blocking body'
        : '';
      const description = [promptAdherenceInstruction, media_prompt, fullBodyInstruction].filter(Boolean).join(', ');
      const referenceDenoise = imageStyle === 'fullbody' ? 0.55 : 0.45;
      const referenceStrength = imageStyle === 'fullbody' ? 0.50 : 0.55;

      console.log('Generating chat image with identity reference for', archetype_id);
      const genRes = await fetch(`${APP_URL}/api/generate-companion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          structured_prompt: structuredPromptForArchetype(archetype),
          gender: archetype.gender,
          negative_prompt: subjectNegativeForArchetype(archetype, media_prompt),
          style: imageStyle,
          num_inference_steps: 35,
          guidance_scale: 5,
          seed: -1,
          reference_image_url: referenceImageUrl || undefined,
          reference_mode: referenceImageUrl ? 'identity' : undefined,
          reference_strength: referenceImageUrl ? referenceStrength : undefined,
          denoise_strength: referenceImageUrl ? referenceDenoise : undefined,
        }),
      });

      const genData = await genRes.json();
      if (!genRes.ok) {
        await supabase
          .from('chat_messages')
          .update({ media_status: 'failed' })
          .eq('id', message_id);
        return NextResponse.json(
          { error: genData.error || 'Generation failed' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        jobId: genData.jobId,
        message_id,
        status: 'generating',
      });
    }

    if (media_type === 'video') {
      const { data: imageData } = await supabase
        .from('archetype_images')
        .select('image_url')
        .eq('archetype_id', archetype_id)
        .maybeSingle();

      const frameUrl = imageData?.image_url;
      if (!frameUrl) {
        await supabase
          .from('chat_messages')
          .update({ media_status: 'failed' })
          .eq('id', message_id);
        return NextResponse.json({ error: 'No source image for video' }, { status: 400 });
      }
      const videoFrameUrl = frameUrl.startsWith('data:image/')
        ? `${APP_URL}/api/archetypes/images/${encodeURIComponent(archetype_id)}/data`
        : frameUrl;

      const videoRes = await fetch(`${APP_URL}/api/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          userMessage: media_prompt,
          frameUrl: videoFrameUrl,
          archetypeId: archetype_id,
          wardrobeState: 'clothed',
          conversationHistory: [{ role: 'user', content: media_prompt }],
        }),
      });

      const videoData = await videoRes.json();

      if (!videoRes.ok || !videoData.prediction_id) {
        await supabase
          .from('chat_messages')
          .update({ media_status: 'failed' })
          .eq('id', message_id);
        return NextResponse.json(
          { error: videoData.error || 'Video generation failed' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        jobId: videoData.prediction_id,
        provider: videoData.provider,
        source_frame_url: videoData.source_frame_url ?? null,
        message_id,
        status: 'generating',
      });
    }

    return NextResponse.json({ error: 'Unknown media type' }, { status: 400 });

  } catch (error) {
    console.error('Chat media generate error:', error);
    return NextResponse.json({ error: 'Media generation failed' }, { status: 500 });
  }
}
