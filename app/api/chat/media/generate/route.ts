import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { archetypes } from '@/lib/archetypes';
import { getArchetypeImagePrompt } from '@/lib/archetype-image-prompts';

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

function subjectNegativeForArchetype(archetype: NonNullable<(typeof archetypes)[number]>) {
  const wrongGender = archetype.gender === 'F'
    ? 'man, male, masculine face, beard, mustache'
    : 'woman, female, feminine face, breasts';

  return [
    wrongGender,
    'white person',
    'caucasian',
    'european features',
    'wrong ethnicity',
    'wrong gender',
  ].join(', ');
}

function styleForMediaPrompt(prompt: string) {
  return /\b(full body|full-body|head to toe|entire body|whole body|legs?|standing|spread)\b/i.test(prompt)
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

      const referenceImageUrl = imageData?.image_url || null;
      const imageStyle = styleForMediaPrompt(media_prompt);

      console.log('Generating chat image with identity reference for', archetype_id);
      const genRes = await fetch(`${APP_URL}/api/generate-companion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: media_prompt,
          structured_prompt: structuredPromptForArchetype(archetype),
          gender: archetype.gender,
          negative_prompt: subjectNegativeForArchetype(archetype),
          style: imageStyle,
          num_inference_steps: 35,
          guidance_scale: 5,
          seed: -1,
          reference_image_url: referenceImageUrl || undefined,
          reference_mode: referenceImageUrl ? 'identity' : undefined,
          reference_strength: referenceImageUrl ? 0.18 : undefined,
          denoise_strength: referenceImageUrl ? 0.70 : undefined,
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

      const videoRes = await fetch(`${APP_URL}/api/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          userMessage: media_prompt,
          frameUrl,
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
