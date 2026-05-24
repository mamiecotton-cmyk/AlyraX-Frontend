import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type ArchetypeImageRow = {
  archetype_id: string | null;
  image_url: string | null;
};

type GalleryImageRow = {
  archetype_id: string | null;
  id?: string | null;
  image_url: string | null;
  is_main: boolean | null;
};

function imageUrlForResponse(archetypeId: string, imageUrl: string) {
  if (!imageUrl.startsWith('data:image/')) return imageUrl;
  return `/api/archetypes/images/${encodeURIComponent(archetypeId)}/data`;
}

export async function GET() {
  try {
    const supabase = await createClient();

    const [imageResult, galleryResult] = await Promise.all([
      supabase
        .from('archetype_images')
        .select('archetype_id, image_url'),
      supabase
        .from('archetype_gallery')
        .select('id, archetype_id, image_url, is_main')
        .order('archetype_id', { ascending: true })
        .order('is_main', { ascending: false })
        .order('sort_order', { ascending: true }),
    ]);

    if (imageResult.error) throw imageResult.error;
    if (galleryResult.error) throw galleryResult.error;

    // Return as a map: { archetypeId -> image_url }. Gallery is canonical
    // because profile pages render from it; archetype_images is a fallback.
    const map: Record<string, string> = {};
    for (const row of (imageResult.data ?? []) as ArchetypeImageRow[]) {
      if (!row.archetype_id || !row.image_url) continue;
      map[row.archetype_id] = imageUrlForResponse(row.archetype_id, row.image_url);
    }

    const galleryPicked = new Set<string>();
    for (const row of (galleryResult.data ?? []) as GalleryImageRow[]) {
      if (!row.archetype_id || !row.image_url || galleryPicked.has(row.archetype_id)) continue;
      const url = row.image_url.startsWith('data:image/') && row.id
        ? `/api/archetypes/images/${encodeURIComponent(row.archetype_id)}/data?galleryImageId=${encodeURIComponent(row.id)}`
        : imageUrlForResponse(row.archetype_id, row.image_url);
      map[row.archetype_id] = url;
      galleryPicked.add(row.archetype_id);
    }

    return NextResponse.json(
      { images: map },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Archetype images fetch error:', error);
    return NextResponse.json(
      { images: {} },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
