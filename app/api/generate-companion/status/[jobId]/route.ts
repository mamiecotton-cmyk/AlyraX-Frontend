import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    const { jobId } = params;
    const imageEndpointId = process.env.RUNPOD_IMAGE_ENDPOINT_ID;

    if (!imageEndpointId) {
      return NextResponse.json({ error: 'Missing RUNPOD_IMAGE_ENDPOINT_ID' }, { status: 500 });
    }

    const statusResponse = await fetch(
      `https://api.runpod.ai/v2/${imageEndpointId}/status/${jobId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
        },
      }
    );

    if (!statusResponse.ok) {
      const err = await statusResponse.text();
      console.error('RunPod status proxy error:', err);
      return NextResponse.json({ error: 'Failed to fetch status' }, { status: 502 });
    }

    const statusData = await statusResponse.json();
    console.log(`Job ${jobId} full status response:`, JSON.stringify(statusData));

    // If completed, try to save the image to Supabase (same behavior as previous flow)
    if (statusData.status === 'COMPLETED') {
      const imageBase64 = statusData.output?.image;
      const outputSeed = statusData.output?.seed;
      const outputWidth = statusData.output?.width;
      const outputHeight = statusData.output?.height;

      if (!imageBase64) {
        return NextResponse.json({ error: 'No image returned' }, { status: 500 });
      }

      try {
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
            seed: outputSeed,
            width: outputWidth,
            height: outputHeight,
            raw: statusData,
          });
        }

        return NextResponse.json({
          image_url: `data:image/png;base64,${imageBase64}`,
          success: true,
          seed: outputSeed,
          width: outputWidth,
          height: outputHeight,
          raw: statusData,
        });
      } catch (err) {
        console.error('Error saving completed image:', err);
        // Return the raw status data to help debugging
        return NextResponse.json({ success: true, raw: statusData });
      }
    }

    // Otherwise just proxy the status object
    return NextResponse.json(statusData);
  } catch (error) {
    console.error('Status proxy error:', error);
    return NextResponse.json({ error: 'Status check failed' }, { status: 500 });
  }
}
