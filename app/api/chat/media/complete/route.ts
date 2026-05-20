import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { message_id, media_url, status } = await req.json();

    if (!message_id) {
      return NextResponse.json({ error: 'Missing message_id' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { error } = await supabase
      .from('chat_messages')
      .update({
        media_url: media_url ?? null,
        media_status: status ?? 'ready',
      })
      .eq('id', message_id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Chat media complete error:', error);
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }
}
