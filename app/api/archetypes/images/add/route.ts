import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { archetype_id, image_url, seed, prompt_used, style } = await req.json();
    if (!archetype_id || !image_url) return NextResponse.json({ error: 'Missing' }, { status: 400 });

    const supabase = await createClient();
    const { error } = await supabase
      .from('archetype_images')
      .insert({ archetype_id, image_url, seed: seed ?? null, prompt_used: prompt_used ?? null, style: style ?? 'portrait' });

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Archetype image add error:', err);
    return NextResponse.json({ error: 'Add failed' }, { status: 500 });
  }
}
