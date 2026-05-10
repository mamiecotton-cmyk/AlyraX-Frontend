import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

async function getPersonaIdByIndex(index: number) {
  const supabase = await createClient();
  const { data: personas, error } = await supabase
    .from('personas')
    .select('id, name')
    .order('sort_order');

  if (error) throw error;

  return personas?.[index]?.id || null;
}

export async function POST(req: NextRequest) {
  try {
    const { personaIndex } = await req.json();

    if (typeof personaIndex !== 'number') {
      return NextResponse.json({ error: 'Missing personaIndex' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const personaId = await getPersonaIdByIndex(personaIndex);

    if (!personaId) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('companions')
      .update({ persona_id: personaId })
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({ success: true, persona_id: personaId });
  } catch (error) {
    console.error('Persona update error:', error);
    return NextResponse.json({ error: 'Persona update failed' }, { status: 500 });
  }
}
