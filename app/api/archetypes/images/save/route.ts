import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { archetype_id, image_url, seed, prompt_used, style } = await req.json();

    if (!archetype_id || !image_url) {
      return NextResponse.json({ error: 'Missing archetype_id or image_url' }, { status: 400 });
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from('archetype_images')
      .upsert({
        archetype_id,
        image_url,
        seed: seed ?? null,
        prompt_used: prompt_used ?? null,
        style: style ?? 'portrait',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'archetype_id' });

    if (error) throw error;

    const { data: galleryRows, error: galleryError } = await supabase
      .from('archetype_gallery')
      .select('id')
      .eq('archetype_id', archetype_id)
      .order('sort_order', { ascending: true });

    if (galleryError) throw galleryError;

    if ((galleryRows ?? []).length === 0) {
      const { error: galleryInsertError } = await supabase
        .from('archetype_gallery')
        .insert({
          archetype_id,
          image_url,
          seed: seed ?? null,
          prompt_used: prompt_used ?? null,
          style: style ?? 'portrait',
          is_main: true,
          sort_order: 0,
        });

      if (galleryInsertError) throw galleryInsertError;
    } else if (galleryRows?.length === 1) {
      const { error: galleryUpdateError } = await supabase
        .from('archetype_gallery')
        .update({
          image_url,
          seed: seed ?? null,
          prompt_used: prompt_used ?? null,
          style: style ?? 'portrait',
          is_main: true,
        })
        .eq('id', galleryRows[0].id);

      if (galleryUpdateError) throw galleryUpdateError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Archetype image save error:', error);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
}
