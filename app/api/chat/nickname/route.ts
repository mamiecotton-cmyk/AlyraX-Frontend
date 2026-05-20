import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { archetype_id, nickname, companion_nickname } = await req.json();

    if (!archetype_id) {
      return NextResponse.json({ error: 'Missing archetype_id' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { error } = await supabase
      .from('companion_relationships')
      .upsert({
        user_id: user.id,
        archetype_id,
        ...(nickname !== undefined && { nickname }),
        ...(companion_nickname !== undefined && { companion_nickname }),
      }, { onConflict: 'user_id,archetype_id' });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Nickname update error:', error);
    return NextResponse.json({ error: 'Failed to update nickname' }, { status: 500 });
  }
}