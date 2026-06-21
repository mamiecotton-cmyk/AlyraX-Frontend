import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { BFF_PERSONA_NAME, BFF_SYSTEM_PROMPT } from '@/lib/persona-modes';

export async function POST(req: NextRequest) {
  try {
    const {
      companionName,
      imageUrl,
      promptUsed,
      personaIndex,
      personaName,
      bodyType,
      ethnicity,
      hairColor,
      hairStyle,
      eyeColor,
      vibe,
      ageRange,
      inspirationImageUrl,
      generationSeed,
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

    const requestedPersonaName = typeof personaName === 'string' ? personaName : '';
    const selectedPersonaByName = requestedPersonaName
      ? personas?.find((persona) => persona.name.toLowerCase() === requestedPersonaName.toLowerCase())
      : null;
    const selectedPersona = selectedPersonaByName || personas?.[personaIndex] || personas?.[0];

    if (!selectedPersona?.id) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    const effectivePersonaName = requestedPersonaName || selectedPersona.name;

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
          generation_seed: typeof generationSeed === 'number' ? generationSeed : null,
          personaName: effectivePersonaName,
          personaMode: effectivePersonaName === BFF_PERSONA_NAME ? 'bff' : null,
          personaSystemPrompt: effectivePersonaName === BFF_PERSONA_NAME ? BFF_SYSTEM_PROMPT : null,
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
