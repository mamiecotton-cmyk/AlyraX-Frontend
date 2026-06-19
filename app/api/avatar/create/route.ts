import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 120;

type AvatarParams = {
  gender?: string;
  bodyType?: string;
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  style?: string;
  freeText?: string;
};

function clean(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function buildAvatarPrompt(params: AvatarParams) {
  const parts: string[] = [];
  const gender = clean(params.gender);
  const bodyType = clean(params.bodyType);
  const skinTone = clean(params.skinTone);
  const hairColor = clean(params.hairColor);
  const hairStyle = clean(params.hairStyle);
  const style = clean(params.style);
  const freeText = clean(params.freeText);

  if (gender) parts.push(`${gender.toLowerCase()} person`);
  if (bodyType) parts.push(`${bodyType.toLowerCase()} build`);
  if (skinTone) parts.push(`${skinTone.toLowerCase()} skin`);
  if (hairColor && hairStyle) parts.push(`${hairColor.toLowerCase()} ${hairStyle.toLowerCase()} hair`);
  else if (hairColor) parts.push(`${hairColor.toLowerCase()} hair`);
  else if (hairStyle) parts.push(`${hairStyle.toLowerCase()} hair`);
  if (style) parts.push(`${style.toLowerCase()} style`);
  if (freeText) parts.push(freeText);
  parts.push('natural relaxed portrait, soft even light, plain background');
  parts.push('RAW DSLR photo, photorealistic human, natural skin texture, visible skin pores, realistic eyes');
  return parts.join(', ');
}

function extractImageUrl(data: Record<string, unknown>) {
  const direct = data.image_url || data.imageUrl;
  return typeof direct === 'string' && direct ? direct : '';
}

async function pollGeneratedImage(origin: string, jobId: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 3000));

    const statusRes = await fetch(`${origin}/api/generate-companion/status/${jobId}`);
    const statusData = await statusRes.json().catch(() => ({})) as Record<string, unknown>;

    if (!statusRes.ok) {
      const message = typeof statusData.error === 'string' ? statusData.error : 'Avatar generation failed';
      throw new Error(message);
    }

    const imageUrl = extractImageUrl(statusData);
    if (imageUrl) return imageUrl;

    if (typeof statusData.error === 'string') throw new Error(statusData.error);
    if (statusData.status === 'FAILED') throw new Error('Avatar generation failed');
  }

  throw new Error('Avatar generation timed out');
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const params = await req.json() as AvatarParams;
    const prompt = buildAvatarPrompt(params);
    const origin = new URL(req.url).origin;

    const genRes = await fetch(`${origin}/api/generate-companion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: prompt,
        style: 'portrait',
        gender: params.gender?.toLowerCase().includes('man') || params.gender?.toLowerCase().includes('male') ? 'M' : 'F',
      }),
    });

    const genData = await genRes.json().catch(() => ({})) as Record<string, unknown>;
    if (!genRes.ok) {
      const message = typeof genData.error === 'string' ? genData.error : 'Avatar generation failed';
      return NextResponse.json({ error: message }, { status: genRes.status });
    }

    let imageUrl = extractImageUrl(genData);
    if (!imageUrl && typeof genData.jobId === 'string') {
      imageUrl = await pollGeneratedImage(origin, genData.jobId);
    }
    if (!imageUrl) return NextResponse.json({ error: 'Avatar generation failed' }, { status: 500 });

    await supabase.from('user_avatars').update({ is_active: false }).eq('user_id', user.id);
    const { data: avatar, error } = await supabase
      .from('user_avatars')
      .insert({ user_id: user.id, image_url: imageUrl, params, is_active: true })
      .select('id, image_url')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, avatar });
  } catch (error) {
    console.error('Avatar create error:', error);
    return NextResponse.json({ error: 'Failed to create avatar' }, { status: 500 });
  }
}
