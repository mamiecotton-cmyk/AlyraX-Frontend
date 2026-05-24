import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type ArchetypeImageRow = {
  archetype_id: string | null;
};

type GalleryImageRow = {
  archetype_id: string | null;
  id?: string | null;
  is_main: boolean | null;
};

function imageDataUrl(archetypeId: string, galleryImageId?: string | null) {
  const path = `/api/archetypes/images/${encodeURIComponent(archetypeId)}/data`;
  if (galleryImageId) return `${path}?galleryImageId=${encodeURIComponent(galleryImageId)}`;
  return `/api/archetypes/images/${encodeURIComponent(archetypeId)}/data`;
}

export async function GET() {
  try {
    const supabase = await createClient();

    const [imageResult, galleryResult] = await Promise.all([
      supabase
        .from('archetype_images')
        .select('archetype_id'),
      supabase
        .from('archetype_gallery')
        .select('id, archetype_id, is_main')
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
      if (!row.archetype_id) continue;
      map[row.archetype_id] = imageDataUrl(row.archetype_id);
    }

    const galleryPicked = new Set<string>();
    for (const row of (galleryResult.data ?? []) as GalleryImageRow[]) {
      if (!row.archetype_id || galleryPicked.has(row.archetype_id)) continue;
      map[row.archetype_id] = imageDataUrl(row.archetype_id, row.id);
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
