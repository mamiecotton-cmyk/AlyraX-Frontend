import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('archetype_videos')
      .select('archetype_id, video_url, is_featured, sort_order')
      .order('is_featured', { ascending: false })
      .order('sort_order', { ascending: true });

    if (error) throw error;

    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.archetype_id && row.video_url && !map[row.archetype_id]) {
        map[row.archetype_id] = row.video_url;
      }
    }

    return NextResponse.json(
      { videos: map },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Featured videos fetch error:', error);
    return NextResponse.json(
      { videos: {} },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
