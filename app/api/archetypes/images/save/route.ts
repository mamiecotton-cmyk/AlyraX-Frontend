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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Archetype image save error:', error);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
}