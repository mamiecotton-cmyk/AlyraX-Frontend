import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { archetypes } from '@/lib/archetypes';
import { getArchetypeImagePrompt } from '@/lib/archetype-image-prompts';

export const maxDuration = 300;

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
      const profile = getArchetypeImagePrompt(archetype);

      // Get archetype main image for face reference
      const { data: imageData } = await supabase
        .from('archetype_images')
        .select('image_url')
        .eq('archetype_id', archetype_id)
        .maybeSingle();

      const faceImageUrl = imageData?.image_url;

      // Try InstantID first if we have a reference image
      if (faceImageUrl) {
        try {
          console.log('Attempting InstantID selfie for', archetype_id);
          const selfieRes = await fetch(`${APP_URL}/api/generate-selfie`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              face_image_url: faceImageUrl,
              prompt: media_prompt,
            }),
          });

          const selfieData = await selfieRes.json();
          console.log('InstantID response:', selfieRes.status, selfieData);

          if (selfieRes.ok && selfieData.image_url) {
            await supabase
              .from('chat_messages')
              .update({
                media_url: selfieData.image_url,
                media_status: 'ready',
              })
              .eq('id', message_id);

            return NextResponse.json({
              image_url: selfieData.image_url,
              message_id,
              status: 'ready',
            });
          }
        } catch (err) {
          console.error('InstantID selfie failed, falling back:', err);
        }
      }

      // Fallback to existing pipeline
      console.log('Falling back to standard pipeline for', archetype_id);
      const genRes = await fetch(`${APP_URL}/api/generate-companion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: media_prompt,
          structured_prompt: profile ? {
            race: profile.race,
            gender: archetype.gender,
            age: profile.age,
            wardrobe: profile.wardrobe,
            environment: profile.environment,
            details: profile.details,
          } : undefined,
          gender: archetype.gender,
          style: 'portrait',
          num_inference_steps: 30,
          guidance_scale: 7,
          seed: -1,
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