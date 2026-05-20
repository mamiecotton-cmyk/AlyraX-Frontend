import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const archetypeId = req.nextUrl.searchParams.get('archetype_id');
    if (!archetypeId) return NextResponse.json({ error: 'Missing archetype_id' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('Chat auth error:', authError.message);
      return NextResponse.json({ error: 'Auth failed' }, { status: 401 });
    }
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Get or create conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .eq('archetype_id', archetypeId)
      .maybeSingle();

    if (convError) {
      console.error('Chat conversation fetch error:', JSON.stringify(convError));
      return NextResponse.json({ error: convError.message }, { status: 500 });
    }

    let finalConversation = conversation;

    if (!conversation) {
      const { data: newConv, error: createError } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, archetype_id: archetypeId })
        .select('*')
        .single();

      if (createError) {
        console.error('Chat conversation create error:', JSON.stringify(createError));
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }
      finalConversation = newConv;
    }

    // Fetch last 50 messages
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', finalConversation.id)
      .order('created_at', { ascending: true })
      .limit(50);

    if (messagesError) {
      console.error('Chat messages fetch error:', JSON.stringify(messagesError));
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }

    // Fetch relationship
    const { data: relationship } = await supabase
      .from('companion_relationships')
      .select('*')
      .eq('user_id', user.id)
      .eq('archetype_id', archetypeId)
      .maybeSingle();

    return NextResponse.json({
      conversation: finalConversation,
      messages: messages ?? [],
      relationship: relationship ?? null,
    });
  } catch (error) {
    console.error('Chat conversation unexpected error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 });
  }
}
