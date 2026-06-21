import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

async function getPersonaId(index: number, personaName?: string) {
  const supabase = await createClient();
  const { data: personas, error } = await supabase
    .from('personas')
    .select('id, name')
    .order('sort_order');

  if (error) throw error;

  if (personaName) {
    const match = personas?.find((persona) => persona.name.toLowerCase() === personaName.toLowerCase());
    if (match?.id) return match.id;
  }

  return personas?.[index]?.id || null;
}

export async function POST(req: NextRequest) {
  try {
    const { companionId, personaIndex, personaName } = await req.json();

    if (typeof personaIndex !== 'number') {
      return NextResponse.json({ error: 'Missing personaIndex' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const personaId = await getPersonaId(personaIndex, typeof personaName === 'string' ? personaName : undefined);

    if (!personaId) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    const targetCompanionId = companionId || user.user_metadata?.active_companion_id;

    if (!targetCompanionId) {
      return NextResponse.json({ error: 'Missing companionId' }, { status: 400 });
    }

    const { error } = await supabase
      .from('companions')
      .update({ persona_id: personaId })
      .eq('id', targetCompanionId)
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({ success: true, persona_id: personaId });
  } catch (error) {
    console.error('Persona update error:', error);
    return NextResponse.json({ error: 'Persona update failed' }, { status: 500 });
  }
}
