import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { description, style = 'portrait' } = await req.json();

    const width = style === 'fullbody' ? 768 : 512;
    const height = 1024;

    const qualityTags = 'photorealistic, highly detailed, professional photography, sharp focus, beautiful studio lighting, 8k uhd, masterpiece';
    const composition = style === 'fullbody'
      ? 'full body shot, standing elegantly, neutral studio background'
      : 'upper body portrait, face clearly visible, elegant pose';
    const negative = 'ugly, deformed, blurry, low quality, cartoon, anime, bad anatomy, watermark, text, extra limbs, missing limbs, mutated hands, poorly drawn face';

    const prompt = `${qualityTags}, ${composition}, ${description}`;

    // Submit job async
    const runpodResponse = await fetch(
      `https://api.runpod.ai/v2/${process.env.RUNPOD_IMAGE_ENDPOINT_ID}/run`,
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
      console.error('RunPod submit error:', error);
      return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
    }

    const { id: jobId } = await runpodResponse.json();
    console.log('Job submitted:', jobId);

    // Poll for result (max 4 minutes)
    let attempts = 0;
    const maxAttempts = 48;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusResponse = await fetch(
        `https://api.runpod.ai/v2/${process.env.RUNPOD_IMAGE_ENDPOINT_ID}/status/${jobId}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
          },
        }
      );

      const statusData = await statusResponse.json();
      console.log(`Job ${jobId} status:`, statusData.status);

      if (statusData.status === 'COMPLETED') {
        const imageBase64 = statusData.output?.image;

        if (!imageBase64) {
          return NextResponse.json({ error: 'No image returned' }, { status: 500 });
        }

        // Save to Supabase Storage
        const { createClient } = await import('@/lib/supabase-server');
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const imageBuffer = Buffer.from(imageBase64, 'base64');
          const fileName = `${user.id}/${Date.now()}.png`;

          await supabase.storage
            .from('companions')
            .upload(fileName, imageBuffer, {
              contentType: 'image/png',
              upsert: true,
            });

          const { data: urlData } = supabase.storage
            .from('companions')
            .getPublicUrl(fileName);

          return NextResponse.json({
            image_url: urlData.publicUrl,
            success: true,
          });
        }

        return NextResponse.json({
          image_url: `data:image/png;base64,${imageBase64}`,
          success: true,
        });
      }

      if (statusData.status === 'FAILED') {
        console.error('Job failed:', statusData.error);
        return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
      }

      attempts++;
    }

    return NextResponse.json({ error: 'Generation timed out' }, { status: 504 });

  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}