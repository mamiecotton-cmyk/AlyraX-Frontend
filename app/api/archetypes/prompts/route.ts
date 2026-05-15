import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('archetype_images')
      .select('archetype_id, prompt_used');

    if (error) throw error;

    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.archetype_id && row.prompt_used) map[row.archetype_id] = row.prompt_used;
    }

    return NextResponse.json({ prompts: map });
  } catch (error) {
    console.error('Archetype prompts fetch error:', error);
    return NextResponse.json({ prompts: {} }, { status: 500 });
  }
}