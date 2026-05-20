import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// GET /api/chat/conversation?archetype_id=jaxon
// Returns conversation + last 50 messages + relationship
export async function GET(req: NextRequest) {
  try {
    const archetypeId = req.nextUrl.searchParams.get('archetype_id');
    if (!archetypeId) return NextResponse.json({ error: 'Missing archetype_id' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Get or create conversation
    let { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .eq('archetype_id', archetypeId)
      .maybeSingle();

    if (!conversation) {
      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, archetype_id: archetypeId })
        .select('*')
        .single();
      if (error) throw error;
      conversation = newConv;
    }

    // Fetch last 50 messages
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(50);

    if (messagesError) throw messagesError;

    // Fetch relationship
    const { data: relationship } = await supabase
      .from('companion_relationships')
      .select('*')
      .eq('user_id', user.id)
      .eq('archetype_id', archetypeId)
      .maybeSingle();

    return NextResponse.json({
      conversation,
      messages: messages ?? [],
      relationship: relationship ?? null,
    });
  } catch (error) {
    console.error('Chat conversation error:', error);
    return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 });
  }
}