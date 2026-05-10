import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { companionName, imageUrl, promptUsed, personaIndex } = await req.json();

    if (!companionName || !imageUrl || typeof personaIndex !== 'number') {
      return NextResponse.json({ error: 'Missing companion data' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: personas, error: personasError } = await supabase
      .from('personas')
      .select('id, name')
      .order('sort_order');

    if (personasError) throw personasError;

    const selectedPersona = personas?.[personaIndex];

    if (!selectedPersona?.id) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    const { error: companionError } = await supabase
      .from('companions')
      .upsert({
        user_id: user.id,
        persona_id: selectedPersona.id,
        name: companionName,
        image_url: imageUrl,
        prompt_used: promptUsed,
      }, { onConflict: 'user_id' });

    if (companionError) throw companionError;

    const { error: creditsError } = await supabase.from('credits').upsert({
      user_id: user.id,
      balance_seconds: 0,
    });

    if (creditsError) throw creditsError;

    return NextResponse.json({ success: true, persona_id: selectedPersona.id });
  } catch (error) {
    console.error('Companion save error:', error);
    return NextResponse.json({ error: 'Companion save failed' }, { status: 500 });
  }
}
