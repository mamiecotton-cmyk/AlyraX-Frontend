import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

type VoiceTranscriptMessage = {
  role?: string;
  content?: string;
};

function normalizeVoiceMessages(messages: unknown[]) {
  return messages
    .map((message) => message as VoiceTranscriptMessage)
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string' && message.content.trim())
    .map((message) => ({
      role: message.role === 'assistant' ? 'companion' : 'user',
      content: message.content?.trim() || '',
    }));
}

export async function POST(req: NextRequest) {
  try {
    const { conversation_id, messages } = await req.json();

    if (!conversation_id || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Missing conversation_id or messages' }, { status: 400 });
    }

    const normalizedMessages = normalizeVoiceMessages(messages);
    if (!normalizedMessages.length) {
      return NextResponse.json({ messages: [] });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('Voice transcript auth error:', authError.message);
      return NextResponse.json({ error: 'Auth failed' }, { status: 401 });
    }
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, user_id, archetype_id, message_count')
      .eq('id', conversation_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (conversationError) {
      console.error('Voice transcript conversation fetch error:', JSON.stringify(conversationError));
      return NextResponse.json({ error: conversationError.message }, { status: 500 });
    }
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const { data: insertedMessages, error: insertError } = await supabase
      .from('chat_messages')
      .insert(normalizedMessages.map((message) => ({
        conversation_id,
        role: message.role,
        content: message.content,
      })))
      .select('*');

    if (insertError) {
      console.error('Voice transcript insert error:', JSON.stringify(insertError));
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const completedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        last_message_at: completedAt,
        message_count: (conversation.message_count ?? 0) + normalizedMessages.length,
        updated_at: completedAt,
      })
      .eq('id', conversation_id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Voice transcript conversation update error:', JSON.stringify(updateError));
    }

    if (conversation.archetype_id) {
      await supabase
        .from('companion_relationships')
        .upsert({
          user_id: user.id,
          archetype_id: conversation.archetype_id,
          last_talked_at: completedAt,
        }, { onConflict: 'user_id,archetype_id' });
    }

    return NextResponse.json({ messages: insertedMessages ?? [] });
  } catch (error) {
    console.error('Voice transcript save error:', error);
    return NextResponse.json({ error: 'Failed to save voice transcript' }, { status: 500 });
  }
}
