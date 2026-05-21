import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { archetypes } from '@/lib/archetypes';

export async function POST(req: NextRequest) {
  try {
    const { archetypeId } = await req.json();

    if (!archetypeId) {
      return NextResponse.json({ error: 'Missing archetypeId' }, { status: 400 });
    }

    // Find the archetype in the hardcoded list
    const archetype = archetypes.find((a) => a.id === archetypeId);
    if (!archetype) {
      return NextResponse.json({ error: 'Archetype not found' }, { status: 404 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user already has this archetype as a companion
    const { data: existing } = await supabase
      .from('companions')
      .select('id')
      .eq('user_id', user.id)
      .eq('archetype_id', archetypeId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        companion_id: existing.id,
        already_exists: true,
      });
    }

    // Find the matching persona by name
    const { data: persona } = await supabase
      .from('personas')
      .select('id, name, voice_id')
      .ilike('name', archetype.name)
      .maybeSingle();

    // Get the archetype's main image
    const { data: imageData } = await supabase
      .from('archetype_images')
      .select('image_url')
      .eq('archetype_id', archetypeId)
      .maybeSingle();

    const imageUrl = imageData?.image_url || '';

    // Create the companion
    const { data: companion, error: companionError } = await supabase
      .from('companions')
      .insert({
        user_id: user.id,
        persona_id: persona?.id || null,
        archetype_id: archetypeId,
        name: archetype.name,
        image_url: imageUrl,
        prompt_used: JSON.stringify({
          archetypeId,
          ethnicity: 'Black',
          vibe: archetype.vibe,
          energy: archetype.energy,
          style: archetype.style,
          ageRange: `${archetype.age}`,
        }),
      })
      .select('id')
      .single();

    if (companionError) throw companionError;

    // Set as active companion
    await supabase.auth.updateUser({
      data: { active_companion_id: companion.id },
    });

    // Ensure credits row exists
    const { data: existingCredits } = await supabase
      .from('credits')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existingCredits) {
      await supabase.from('credits').insert({
        user_id: user.id,
        balance_seconds: 0,
      });
    }

    return NextResponse.json({
      success: true,
      companion_id: companion.id,
      persona_id: persona?.id || null,
      voice_id: persona?.voice_id || null,
      already_exists: false,
    });
  } catch (error) {
    console.error('Create from archetype error:', error);
    return NextResponse.json({ error: 'Failed to create companion' }, { status: 500 });
  }
}
