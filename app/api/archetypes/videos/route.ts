import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const archetypeId = req.nextUrl.searchParams.get('archetype_id');
    if (!archetypeId) return NextResponse.json({ error: 'Missing archetype_id' }, { status: 400 });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('archetype_videos')
      .select('*')
      .eq('archetype_id', archetypeId)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return NextResponse.json(
      { videos: data ?? [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Videos fetch error:', error);
    return NextResponse.json(
      { videos: [] },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { archetype_id, video_url, source_image_url, prompt_used, is_featured } = await req.json();
    if (!archetype_id || !video_url) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    // Get next sort_order
    const { data: existing } = await supabase
      .from('archetype_videos')
      .select('sort_order')
      .eq('archetype_id', archetype_id)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextOrder = existing?.[0]?.sort_order != null ? existing[0].sort_order + 1 : 0;

    // If featured, clear others
    if (is_featured) {
      await supabase
        .from('archetype_videos')
        .update({ is_featured: false })
        .eq('archetype_id', archetype_id);
    }

    const { data, error } = await supabase
      .from('archetype_videos')
      .insert({
        archetype_id,
        video_url,
        source_image_url: source_image_url ?? null,
        prompt_used: prompt_used ?? null,
        is_featured: is_featured ?? false,
        sort_order: nextOrder,
      })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, video: data });
  } catch (error) {
    console.error('Video insert error:', error);
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
  }
}
