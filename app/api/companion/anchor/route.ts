import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

type CompanionMetadata = {
  prompt?: string;
  portraitAnchorUrl?: string;
  fullBodyAnchorUrl?: string;
  nudeAnchorUrl?: string;
  bodyReferenceUrl?: string;
  [key: string]: unknown;
};

function parseMetadata(promptUsed?: string | null): CompanionMetadata {
  if (!promptUsed) return {};

  try {
    const parsed = JSON.parse(promptUsed) as CompanionMetadata;
    return parsed && typeof parsed === 'object' ? parsed : { prompt: promptUsed };
  } catch {
    return { prompt: promptUsed };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companionId, anchorType = 'portrait', anchorUrl, fullBodyAnchorUrl } = await req.json();
    const nextAnchorUrl = anchorUrl || fullBodyAnchorUrl;

    if (!companionId || !nextAnchorUrl) {
      return NextResponse.json({ error: 'Missing companionId or anchorUrl' }, { status: 400 });
    }

    if (anchorType !== 'portrait') {
      return NextResponse.json({ error: 'Only portrait anchors are supported' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: companion, error: lookupError } = await supabase
      .from('companions')
      .select('prompt_used')
      .eq('id', companionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!companion) {
      return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
    }

    const metadataWithoutBodyAnchors = parseMetadata(companion.prompt_used);
    delete metadataWithoutBodyAnchors.fullBodyAnchorUrl;
    delete metadataWithoutBodyAnchors.nudeAnchorUrl;
    delete metadataWithoutBodyAnchors.bodyReferenceUrl;
    const nextMetadata = {
      ...metadataWithoutBodyAnchors,
      portraitAnchorUrl: nextAnchorUrl,
    };

    const { error: updateError } = await supabase
      .from('companions')
      .update({ prompt_used: JSON.stringify(nextMetadata) })
      .eq('id', companionId)
      .eq('user_id', user.id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Companion anchor update error:', error);
    return NextResponse.json({ error: 'Companion anchor update failed' }, { status: 500 });
  }
}
