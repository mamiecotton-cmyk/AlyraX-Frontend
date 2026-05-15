import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('custom_archetypes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ archetypes: data ?? [] });
  } catch (error) {
    console.error('Custom archetypes fetch error:', error);
    return NextResponse.json({ archetypes: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const {
      dossier_id, name, gender, archetype, tagline, quote, bio,
      vibe, energy, style, background, image_gradient, accent_color,
      vector, image_url, prompt_used, seed,
    } = body;

    if (!name || !gender || !archetype || !dossier_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('custom_archetypes')
      .insert({
        dossier_id, name, gender, archetype,
        tagline: tagline || '',
        quote: quote || '',
        bio: bio || '',
        vibe: vibe || '',
        energy: energy || '',
        style: style || '',
        background: background || '',
        image_gradient: image_gradient || 'linear-gradient(180deg, #1a1410 0%, #0d0b08 60%, #000 100%)',
        accent_color: accent_color || '#3a3020',
        vector: vector || [0.5, 0.5, 0.5, 0.5, 0.5],
        image_url: image_url || null,
        prompt_used: prompt_used || null,
        seed: seed || null,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, id: data.id });
  } catch (error) {
    console.error('Custom archetype create error:', error);
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }
}