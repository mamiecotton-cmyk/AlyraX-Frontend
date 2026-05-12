import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const {
      companionName,
      imageUrl,
      promptUsed,
      personaIndex,
      bodyType,
      ethnicity,
      hairColor,
      hairStyle,
      eyeColor,
      vibe,
      ageRange,
      inspirationImageUrl,
    } = await req.json();

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

    const { data: companion, error: companionError } = await supabase
      .from('companions')
      .insert({
        user_id: user.id,
        persona_id: selectedPersona.id,
        name: companionName,
        image_url: imageUrl,
        prompt_used: JSON.stringify({
          prompt: promptUsed,
          bodyType,
          ethnicity,
          hairColor,
          hairStyle,
          eyeColor,
          vibe,
          ageRange,
          inspirationImageUrl,
        }),
      })
      .select('id')
      .single();

    if (companionError) throw companionError;

    const { error: activeCompanionError } = await supabase.auth.updateUser({
      data: { active_companion_id: companion.id },
    });

    if (activeCompanionError) throw activeCompanionError;

    const { data: existingCredits, error: creditsLookupError } = await supabase
      .from('credits')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (creditsLookupError) throw creditsLookupError;

    if (!existingCredits) {
      const { error: creditsError } = await supabase.from('credits').insert({
        user_id: user.id,
        balance_seconds: 0,
      });

      if (creditsError) throw creditsError;
    }

    return NextResponse.json({
      success: true,
      companion_id: companion.id,
      persona_id: selectedPersona.id,
    });
  } catch (error) {
    console.error('Companion save error:', error);
    return NextResponse.json({ error: 'Companion save failed' }, { status: 500 });
  }
}
