import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

type ArchetypeImageRow = {
  archetype_id: string | null;
  image_url: string | null;
};

type GalleryImageRow = {
  archetype_id: string | null;
  image_url: string | null;
  is_main: boolean | null;
};

export async function GET() {
  try {
    const supabase = await createClient();

    const [imageResult, galleryResult] = await Promise.all([
      supabase
        .from('archetype_images')
        .select('archetype_id, image_url'),
      supabase
        .from('archetype_gallery')
        .select('archetype_id, image_url, is_main')
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
      map[row.archetype_id] = row.image_url;
    }

    const galleryPicked = new Set<string>();
    for (const row of (galleryResult.data ?? []) as GalleryImageRow[]) {
      if (!row.archetype_id || !row.image_url || galleryPicked.has(row.archetype_id)) continue;
      map[row.archetype_id] = row.image_url;
      galleryPicked.add(row.archetype_id);
    }

    return NextResponse.json({ images: map });
  } catch (error) {
    console.error('Archetype images fetch error:', error);
    return NextResponse.json({ images: {} }, { status: 500 });
  }
}
