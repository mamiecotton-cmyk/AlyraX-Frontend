import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { archetypes } from '@/lib/archetypes';
import { buildSelfiePrompt, isSelfieRequest, isVideoRequest } from '@/lib/chat-media';

type VoiceContextMessage = {
  role?: string;
  content?: string;
};

function buildVoiceContextPrompt(message: string, voiceContext: unknown) {
  if (!Array.isArray(voiceContext)) return message;

  const context = voiceContext
    .map((entry) => entry as VoiceContextMessage)
    .filter((entry) => (entry.role === 'user' || entry.role === 'assistant') && typeof entry.content === 'string' && entry.content.trim())
    .slice(-8)
    .map((entry) => `${entry.role === 'assistant' ? 'companion' : 'user'}: ${entry.content?.trim()}`)
    .join(' | ');

  if (!context) return message;

  return [
    `user photo request: ${message}`,
    `current live voice-call context: ${context}`,
    'create the photo as a candid snapshot of what the companion is doing right now in that live call scene',
    'match the current activity, mood, setting, clothing or nudity level, body position, and camera angle from the call context',
    'do not default to a neutral studio portrait unless the current call context specifically says studio',
  ].join(', ');
}

export async function POST(req: NextRequest) {
  try {
    const { conversation_id, archetype_id, message, voice_context } = await req.json();

    if (!conversation_id || !archetype_id || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const archetype = archetypes.find(a => a.id === archetype_id);
    if (!archetype) return NextResponse.json({ error: 'Archetype not found' }, { status: 404 });

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, user_id, message_count')
      .eq('id', conversation_id)
      .eq('user_id', user.id)
      .eq('archetype_id', archetype_id)
      .maybeSingle();

    if (conversationError) {
      console.error('Voice media conversation fetch error:', JSON.stringify(conversationError));
      return NextResponse.json({ error: conversationError.message }, { status: 500 });
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const wantsVideo = isVideoRequest(message);
    const wantsSelfie = !wantsVideo && isSelfieRequest(message);

    if (!wantsSelfie && !wantsVideo) {
      return NextResponse.json({ ignored: true, mediaMessage: null });
    }

    const { data: userMsg, error: userMsgError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id,
        role: 'user',
        content: message,
      })
      .select('*')
      .single();

    if (userMsgError) throw userMsgError;

    const mediaType = wantsVideo ? 'video' : 'image';
    const contextualMessage = buildVoiceContextPrompt(message, voice_context);
    const mediaPrompt = wantsVideo ? contextualMessage : buildSelfiePrompt(contextualMessage, archetype);

    const { data: mediaMsg, error: mediaMsgError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id,
        role: 'companion',
        content: null,
        media_type: mediaType,
        media_status: 'generating',
        media_prompt: mediaPrompt,
      })
      .select('*')
      .single();

    if (mediaMsgError) throw mediaMsgError;

    const now = new Date().toISOString();
    const { error: conversationUpdateError } = await supabase
      .from('conversations')
      .update({
        last_message_at: now,
        message_count: (conversation.message_count ?? 0) + 2,
        updated_at: now,
      })
      .eq('id', conversation_id)
      .eq('user_id', user.id);

    if (conversationUpdateError) {
      console.error('Voice media conversation update error:', JSON.stringify(conversationUpdateError));
    }

    await supabase
      .from('companion_relationships')
      .upsert({
        user_id: user.id,
        archetype_id,
        last_talked_at: now,
      }, { onConflict: 'user_id,archetype_id' });

    return NextResponse.json({
      userMessage: userMsg,
      mediaMessage: mediaMsg,
      wantsSelfie,
      wantsVideo,
    });
  } catch (error) {
    console.error('Voice media request error:', error);
    return NextResponse.json({ error: 'Failed to create media request' }, { status: 500 });
  }
}
