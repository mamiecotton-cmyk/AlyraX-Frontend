import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { archetypes } from '@/lib/archetypes';
import { getUserDisplayName } from '@/lib/companion-memory';

function buildInitialGreeting(archetypeId: string, userName: string) {
  const archetype = archetypes.find(a => a.id === archetypeId);
  const companionName = archetype?.name || 'me';
  const address = userName ? ` ${userName}` : '';

  if (archetypeId === 'jaxon') {
    return `There you are${address}. I was wondering when you were going to come talk to me.`;
  }

  return `Hey${address}, it's ${companionName}. I was hoping you'd come find me.`;
}

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

    // Fetch newest 50 messages, then restore chronological display order.
    const { data: initialMessages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', finalConversation.id)
      .order('created_at', { ascending: false })
      .limit(50);
    let messages = initialMessages;

    if (messagesError) {
      console.error('Chat messages fetch error:', JSON.stringify(messagesError));
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }

    if (!messages?.length) {
      const now = new Date().toISOString();
      const { data: greetingMessage, error: greetingError } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: finalConversation.id,
          role: 'companion',
          content: buildInitialGreeting(archetypeId, getUserDisplayName(user.user_metadata, user.email)),
        })
        .select('*')
        .single();

      if (greetingError) {
        console.error('Chat greeting create error:', JSON.stringify(greetingError));
        return NextResponse.json({ error: greetingError.message }, { status: 500 });
      }

      await supabase
        .from('conversations')
        .update({
          last_message_at: now,
          message_count: 1,
          updated_at: now,
        })
        .eq('id', finalConversation.id)
        .eq('user_id', user.id);

      messages = greetingMessage ? [greetingMessage] : [];
      finalConversation = { ...finalConversation, last_message_at: now, message_count: 1, updated_at: now };
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
      messages: [...(messages ?? [])].reverse(),
      relationship: relationship ?? null,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Chat conversation unexpected error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 });
  }
}
