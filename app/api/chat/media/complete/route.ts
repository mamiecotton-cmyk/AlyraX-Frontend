import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { archetypes } from '@/lib/archetypes';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || 'sao10k/l3.3-euryale-70b';

async function generatePhotoReaction(archetypeName: string, vibe: string, mediaPrompt: string): Promise<string | null> {
  if (!OPENROUTER_API_KEY) return null;
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://alyra-x-frontend.vercel.app',
        'X-Title': 'AlyraX',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 80,
        temperature: 0.9,
        messages: [
          {
            role: 'system',
            content: `You are ${archetypeName}. ${vibe} You just sent the user a photo of yourself. React to it now, briefly and flirtatiously, in 1-2 short sentences — as if you're glancing at what you just sent. Write like a real text message. Never use generic AI phrases. Do not describe the photo in technical detail.`,
          },
          {
            role: 'user',
            content: `The photo shows: ${mediaPrompt}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message_id, media_url, status } = await req.json();

    if (!message_id) {
      return NextResponse.json({ error: 'Missing message_id' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: mediaMessage, error: fetchError } = await supabase
      .from('chat_messages')
      .select('conversation_id, media_prompt, media_type')
      .eq('id', message_id)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const { error } = await supabase
      .from('chat_messages')
      .update({
        media_url: media_url ?? null,
        media_status: status ?? 'ready',
      })
      .eq('id', message_id);

    if (error) throw error;

    let reactionMessage = null;

    if (status === 'ready' && mediaMessage?.media_type === 'image' && mediaMessage.media_prompt && mediaMessage.conversation_id) {
      const { data: conversation } = await supabase
        .from('conversations')
        .select('archetype_id')
        .eq('id', mediaMessage.conversation_id)
        .maybeSingle();

      const archetype = conversation?.archetype_id
        ? archetypes.find(a => a.id === conversation.archetype_id)
        : null;

      if (archetype) {
        const reactionText = await generatePhotoReaction(archetype.name, archetype.vibe ?? '', mediaMessage.media_prompt);

        if (reactionText) {
          const { data: insertedMsg } = await supabase
            .from('chat_messages')
            .insert({
              conversation_id: mediaMessage.conversation_id,
              role: 'companion',
              content: reactionText,
            })
            .select('*')
            .single();

          reactionMessage = insertedMsg;
        }
      }
    }

    return NextResponse.json({ success: true, reactionMessage });
  } catch (error) {
    console.error('Chat media complete error:', error);
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }
}
