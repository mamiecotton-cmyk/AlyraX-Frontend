import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

type GalleryImageResponse = {
  id?: string | null;
  archetype_id?: string | null;
  image_url?: string | null;
};

function normalizeInlineImageUrl(row: GalleryImageResponse) {
  if (!row.archetype_id || !row.image_url?.startsWith('data:image/')) return row;
  return {
    ...row,
    image_url: row.id
      ? `/api/archetypes/images/${encodeURIComponent(row.archetype_id)}/data?galleryImageId=${encodeURIComponent(row.id)}`
      : `/api/archetypes/images/${encodeURIComponent(row.archetype_id)}/data`,
  };
}

export async function GET(req: NextRequest) {
  try {
    const archetypeId = req.nextUrl.searchParams.get('archetype_id');
    if (!archetypeId) return NextResponse.json({ error: 'Missing archetype_id' }, { status: 400 });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('archetype_gallery')
      .select('*')
      .eq('archetype_id', archetypeId)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ images: (data ?? []).map(normalizeInlineImageUrl) });
  } catch (error) {
    console.error('Gallery fetch error:', error);
    return NextResponse.json({ images: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { archetype_id, image_url, seed, style, prompt_used, is_main } = await req.json();
    if (!archetype_id || !image_url) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    // Get current max sort_order
    const { data: existing } = await supabase
      .from('archetype_gallery')
      .select('sort_order')
      .eq('archetype_id', archetype_id)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextOrder = existing?.[0]?.sort_order != null ? existing[0].sort_order + 1 : 0;

    // If setting as main, clear existing mains
    if (is_main) {
      await supabase
        .from('archetype_gallery')
        .update({ is_main: false })
        .eq('archetype_id', archetype_id);
    }

    const { data, error } = await supabase
      .from('archetype_gallery')
      .insert({
        archetype_id,
        image_url,
        seed: seed ?? null,
        style: style ?? 'portrait',
        prompt_used: prompt_used ?? null,
        is_main: is_main ?? false,
        sort_order: nextOrder,
      })
      .select('*')
      .single();

    if (error) throw error;

    // Also update archetype_images main record if is_main
    if (is_main) {
      await supabase
        .from('archetype_images')
        .upsert({ archetype_id, image_url, prompt_used: prompt_used ?? null, updated_at: new Date().toISOString() }, { onConflict: 'archetype_id' });
    }

    return NextResponse.json({ success: true, image: data });
  } catch (error) {
    console.error('Gallery insert error:', error);
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
  }
}
