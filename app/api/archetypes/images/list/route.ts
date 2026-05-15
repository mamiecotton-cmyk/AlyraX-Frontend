import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const archetypeId = searchParams.get('id');
    if (!archetypeId) return NextResponse.json({ images: [] });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('archetype_images')
      .select('*')
      .eq('archetype_id', archetypeId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ images: data || [] });
  } catch (err) {
    console.error('Archetype images list error:', err);
    return NextResponse.json({ images: [] }, { status: 500 });
  }
}
