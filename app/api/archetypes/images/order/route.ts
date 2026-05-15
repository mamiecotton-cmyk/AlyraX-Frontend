import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { archetype_id, order } = await req.json();
    if (!archetype_id || !Array.isArray(order)) return NextResponse.json({ error: 'Missing' }, { status: 400 });

    const supabase = await createClient();

    // Try upsert into a lightweight ordering table
    const { error } = await supabase
      .from('archetype_image_order')
      .upsert({ archetype_id, ordering: order }, { onConflict: 'archetype_id' });

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Archetype image order save error:', err);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
}
