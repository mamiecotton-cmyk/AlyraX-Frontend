import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { description, style = 'portrait' } = await req.json();

    const width = style === 'fullbody' ? 768 : 512;
    const height = 1024;

    const qualityTags = 'photorealistic, highly detailed, professional photography, sharp focus, beautiful studio lighting, 8k uhd, masterpiece';
    const composition = style === 'fullbody'
      ? 'full body shot, standing elegantly, neutral studio background'
      : 'upper body portrait, face clearly visible, elegant pose';
    const negative = 'ugly, deformed, blurry, low quality, cartoon, anime, bad anatomy, watermark, text, extra limbs, missing limbs, mutated hands, poorly drawn face';

    const prompt = `${qualityTags}, ${composition}, ${description}`;

    // Call RunPod serverless endpoint
    const runpodResponse = await fetch(
      `https://api.runpod.ai/v2/${process.env.RUNPOD_IMAGE_ENDPOINT_ID}/runsync`,
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
            num_inference_steps: 20,
            guidance_scale: 3.5,
            width,
            height,
            seed: -1,
          }
        }),
      }
    );

    if (!runpodResponse.ok) {
      const error = await runpodResponse.text();
      console.error('RunPod error:', error);
      return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
    }

    const runpodData = await runpodResponse.json();
    const imageBase64 = runpodData.output?.image;

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image returned' }, { status: 500 });
    }

    // Save to Supabase Storage
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const fileName = `${user.id}/${Date.now()}.png`;

    const { error: uploadError } = await supabase
      .storage
      .from('companions')
      .upload(fileName, imageBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const { data: urlData } = supabase
      .storage
      .from('companions')
      .getPublicUrl(fileName);

    return NextResponse.json({
      image_url: urlData.publicUrl,
      success: true,
    });

  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}