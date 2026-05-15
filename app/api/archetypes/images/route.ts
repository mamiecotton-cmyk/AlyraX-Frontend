import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('archetype_images')
      .select('archetype_id, image_url, seed, style');

    if (error) throw error;

    // Return as a map: { archetypeId -> image_url }
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      map[row.archetype_id] = row.image_url;
    }

    return NextResponse.json({ images: map });
  } catch (error) {
    console.error('Archetype images fetch error:', error);
    return NextResponse.json({ images: {} }, { status: 500 });
  }
}