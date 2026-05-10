import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { companionId } = await req.json();

    if (!companionId) {
      return NextResponse.json({ error: 'Missing companionId' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: companion, error } = await supabase
      .from('companions')
      .select('id')
      .eq('id', companionId)
      .eq('user_id', user.id)
      .single();

    if (error || !companion) {
      return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: { active_companion_id: companion.id },
    });

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, active_companion_id: companion.id });
  } catch (error) {
    console.error('Active companion update error:', error);
    return NextResponse.json({ error: 'Active companion update failed' }, { status: 500 });
  }
}
