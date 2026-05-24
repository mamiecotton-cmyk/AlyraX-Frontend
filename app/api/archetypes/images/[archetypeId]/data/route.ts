import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

type ImageRow = {
  image_url: string | null;
};

function dataUrlToResponse(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;

  const [, contentType, payload] = match;
  return new Response(Buffer.from(payload, 'base64'), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ archetypeId: string }> },
) {
  try {
    const { archetypeId } = await params;
    const galleryImageId = req.nextUrl.searchParams.get('galleryImageId');
    const supabase = await createClient();

    let imageUrl: string | null = null;

    if (galleryImageId) {
      const { data, error } = await supabase
        .from('archetype_gallery')
        .select('image_url')
        .eq('id', galleryImageId)
        .eq('archetype_id', archetypeId)
        .maybeSingle<ImageRow>();

      if (error) throw error;
      imageUrl = data?.image_url ?? null;
    }

    if (!imageUrl) {
      const { data: galleryRows, error: galleryError } = await supabase
        .from('archetype_gallery')
        .select('image_url')
        .eq('archetype_id', archetypeId)
        .order('is_main', { ascending: false })
        .order('sort_order', { ascending: true })
        .limit(1)
        .returns<ImageRow[]>();

      if (galleryError) throw galleryError;
      imageUrl = galleryRows?.[0]?.image_url ?? null;
    }

    if (!imageUrl) {
      const { data, error } = await supabase
        .from('archetype_images')
        .select('image_url')
        .eq('archetype_id', archetypeId)
        .maybeSingle<ImageRow>();

      if (error) throw error;
      imageUrl = data?.image_url ?? null;
    }

    if (!imageUrl) return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    if (!imageUrl.startsWith('data:image/')) return NextResponse.redirect(imageUrl);

    const response = dataUrlToResponse(imageUrl);
    if (!response) return NextResponse.json({ error: 'Invalid image data' }, { status: 422 });
    return response;
  } catch (error) {
    console.error('Archetype image data fetch error:', error);
    return NextResponse.json({ error: 'Image fetch failed' }, { status: 500 });
  }
}
