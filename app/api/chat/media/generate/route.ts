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

    if (media_type === 'image') {
      const profile = getArchetypeImagePrompt(archetype);
      const { data: imageData } = await supabase
        .from('archetype_images')
        .select('image_url')
        .eq('archetype_id', archetype_id)
        .maybeSingle();

      // Submit image generation job
      const genRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://alyra-x-frontend.vercel.app'}/api/generate-companion`, {
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
          reference_image_url: imageData?.image_url || undefined,
          reference_strength: 0.22,
          denoise_strength: 0.72,
        }),
      });

      const genData = await genRes.json();

      if (!genRes.ok) {
        await supabase.from('chat_messages').update({ media_status: 'failed' }).eq('id', message_id);
        return NextResponse.json({ error: genData.error || 'Generation failed' }, { status: 500 });
      }

      // Return job ID for client to poll
      return NextResponse.json({
        jobId: genData.jobId,
        message_id,
        status: 'generating',
      });
    }

    if (media_type === 'video') {
      // Get archetype main image for video source
      const { data: imageData } = await supabase
        .from('archetype_images')
        .select('image_url')
        .eq('archetype_id', archetype_id)
        .maybeSingle();

      const frameUrl = imageData?.image_url;
      if (!frameUrl) {
        await supabase.from('chat_messages').update({ media_status: 'failed' }).eq('id', message_id);
        return NextResponse.json({ error: 'No source image for video' }, { status: 400 });
      }

      const videoRes = await fetch('https://alyra-x-frontend.vercel.app/api/generate-video', {
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
        await supabase.from('chat_messages').update({ media_status: 'failed' }).eq('id', message_id);
        return NextResponse.json({ error: videoData.error || 'Video generation failed' }, { status: 500 });
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
