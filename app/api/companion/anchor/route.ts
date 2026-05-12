import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

type CompanionMetadata = {
  prompt?: string;
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
    const { companionId, fullBodyAnchorUrl } = await req.json();

    if (!companionId || !fullBodyAnchorUrl) {
      return NextResponse.json({ error: 'Missing companionId or fullBodyAnchorUrl' }, { status: 400 });
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

    const metadata = parseMetadata(companion.prompt_used);
    const nextMetadata = {
      ...metadata,
      fullBodyAnchorUrl,
      nudeAnchorUrl: fullBodyAnchorUrl,
      bodyReferenceUrl: fullBodyAnchorUrl,
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
