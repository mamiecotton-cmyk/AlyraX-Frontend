import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { archetypes, type Archetype } from '@/lib/archetypes';
import { getArchetypeImagePrompt } from '@/lib/archetype-image-prompts';

export const maxDuration = 60;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const CHAT_MODEL = 'sao10k/l3.3-euryale-70b';
const CHAT_FALLBACK_MODELS = ['deepseek/deepseek-v4-flash', 'openrouter/auto'];

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatAttempt = {
  model: string;
  error: string;
};

function getChatModels() {
  const configured = process.env.OPENROUTER_CHAT_MODELS
    ?.split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  const models = configured?.length
    ? configured
    : [process.env.OPENROUTER_CHAT_MODEL || CHAT_MODEL, ...CHAT_FALLBACK_MODELS];

  return Array.from(new Set(models));
}

function getOpenRouterError(data: Record<string, unknown>) {
  const error = data.error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : JSON.stringify(error);
  }

  const choice = Array.isArray(data.choices) ? data.choices[0] : undefined;
  if (choice && typeof choice === 'object' && (choice as { finish_reason?: unknown }).finish_reason === 'error') {
    return 'Provider returned an error while generating the response';
  }

  return '';
}

async function fetchOpenRouterChat(messages: ChatMessage[]) {
  const attempts: ChatAttempt[] = [];

  for (const model of getChatModels()) {
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
          model,
          max_tokens: 200,
          temperature: 0.88,
          messages,
        }),
      });

      const data = await response.json() as Record<string, unknown>;
      const errorMessage = getOpenRouterError(data);
      const choices = Array.isArray(data.choices) ? data.choices : [];
      const firstChoice = choices[0] as { message?: { content?: unknown } } | undefined;
      const content = typeof firstChoice?.message?.content === 'string'
        ? firstChoice.message.content.trim()
        : '';

      if (response.ok && !errorMessage && content) {
        return { content, model, attempts };
      }

      attempts.push({
        model,
        error: errorMessage || `HTTP ${response.status}: empty response`,
      });
    } catch (error) {
      attempts.push({
        model,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { content: '', model: '', attempts };
}

// Detect if user is requesting a selfie/photo
function isSelfieRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return /\b(selfie|pic|picture|photo|send me|show me|take a|snap|what (are|do) you look(ing)?|what('re| are) you wearing)\b/.test(lower);
}

// Detect if user is requesting a video
function isVideoRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return /\b(video|clip|move|show me moving|animate|come alive|walk|dance)\b/.test(lower);
}

// Build selfie image prompt from user message + archetype
function buildSelfiePrompt(message: string, archetype: Archetype): string {
  const profile = getArchetypeImagePrompt(archetype);
  const base = profile
    ? `${profile.race}, ${profile.age} years old, ${profile.details}`
    : `${archetype.vibe.toLowerCase()}, ${archetype.energy.toLowerCase()}`;

  const lower = message.toLowerCase();

  let scene = profile?.environment ?? archetype.city;
  let wardrobe = profile?.wardrobe ?? archetype.style.toLowerCase();

  if (lower.includes('outside') || lower.includes('outdoor') || lower.includes('street')) {
    scene = 'outdoor street, natural light';
  }
  if (lower.includes('mirror') || lower.includes('bathroom')) {
    scene = 'bathroom mirror selfie, warm light';
    wardrobe = 'casual, natural look';
  }
  if (lower.includes('bed') || lower.includes('morning') || lower.includes('woke')) {
    scene = 'bedroom, soft morning light';
    wardrobe = 'cozy, relaxed';
  }

  return `${base}, ${wardrobe}, ${scene}, genuine warm smile, candid moment, DSLR photo, natural skin, photorealistic`;
}

// Build companion system prompt
function buildSystemPrompt(
  archetype: Archetype,
  relationship: { nickname?: string; companion_nickname?: string } | null,
  recentMessages: { role: string; content: string }[],
): string {
  const userName = relationship?.companion_nickname || '';
  const companionName = relationship?.nickname || archetype.name;
  const recentContext = recentMessages.length
    ? `\nRECENT CONTEXT:\n${recentMessages.map((m) => `${m.role}: ${m.content}`).join('\n')}`
    : '';

  return `You are ${companionName}, a real person having a private text conversation. Never break character. Never mention AI.

YOUR IDENTITY:
- Name: ${companionName}
- Archetype: ${archetype.archetype}
- Vibe: ${archetype.vibe}
- Energy: ${archetype.energy}
- Background: ${archetype.background}
- Tagline: "${archetype.tagline}"

YOUR PERSONALITY IN TEXT:
- Write like a real person texting — casual, warm, natural
- Short to medium messages — 1-3 sentences usually
- Use your personality: ${archetype.vibe}
- Never use generic AI phrases like "certainly" or "of course"
- React to what they say before moving forward
- Be flirty, warm, real — this is a private intimate conversation
- Occasional typos or casual punctuation are fine
${userName ? `- You call them: ${userName}` : ''}

MEDIA AWARENESS:
- If the user asks for a selfie, photo, or pic — respond naturally like you're about to take one. Say something like "give me a sec" or "caught me off guard lol" then end your message. The photo will appear automatically.
- If the user asks for a video — respond like you're about to record one. Keep it brief and in character.
- Never describe what the photo/video will look like. Just react naturally.

RULES:
- Keep responses concise — this is texting not an essay
- Stay in character always
- Be warm, present, and genuinely interested in them${recentContext}`;
}

export async function POST(req: NextRequest) {
  try {
    const { conversation_id, archetype_id, message, history } = await req.json();

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
      console.error('Chat send conversation fetch error:', JSON.stringify(conversationError));
      return NextResponse.json({ error: conversationError.message }, { status: 500 });
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Fetch relationship for nickname context
    const { data: relationship } = await supabase
      .from('companion_relationships')
      .select('*')
      .eq('user_id', user.id)
      .eq('archetype_id', archetype_id)
      .maybeSingle();

    // Save user message
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

    const userMessageAt = new Date().toISOString();
    const { error: userConversationUpdateError } = await supabase
      .from('conversations')
      .update({
        last_message_at: userMessageAt,
        message_count: (conversation.message_count ?? 0) + 1,
        updated_at: userMessageAt,
      })
      .eq('id', conversation_id)
      .eq('user_id', user.id);

    if (userConversationUpdateError) {
      console.error('Chat user conversation update error:', JSON.stringify(userConversationUpdateError));
    }

    // Detect media requests
    const wantsSelfie = isSelfieRequest(message);
    const wantsVideo = isVideoRequest(message);

    // Get companion text response from LLM
    const recentHistory = (history ?? []).slice(-12).map((m: { role: string; content: string }) => ({
      role: m.role === 'companion' ? 'assistant' : 'user',
      content: m.content ?? '',
    }));

    const systemPrompt = buildSystemPrompt(archetype, relationship, recentHistory);

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'Missing OPENROUTER_API_KEY', userMessage: userMsg },
        { status: 500 }
      );
    }

    const { content: companionText, model: responseModel, attempts } = await fetchOpenRouterChat([
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: message },
    ]);

    if (!companionText) {
      console.error('OpenRouter chat failed after fallbacks:', JSON.stringify(attempts));
      return NextResponse.json(
        { error: 'Chat provider is temporarily unavailable. Please try again.', userMessage: userMsg },
        { status: 502 }
      );
    }

    if (attempts.length) {
      console.warn('OpenRouter chat recovered with fallback:', JSON.stringify({ responseModel, attempts }));
    }

    // Save companion text message
    const { data: companionMsg, error: companionMsgError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id,
        role: 'companion',
        content: companionText,
      })
      .select('*')
      .single();

    if (companionMsgError) throw companionMsgError;

    // If selfie requested — create a generating placeholder message
    let mediaMsg = null;
    if (wantsSelfie) {
      const selfiePrompt = buildSelfiePrompt(message, archetype);
      const { data: mediaMsgData } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id,
          role: 'companion',
          content: null,
          media_type: 'image',
          media_status: 'generating',
          media_prompt: selfiePrompt,
        })
        .select('*')
        .single();
      mediaMsg = mediaMsgData;
    }

    if (wantsVideo) {
      const { data: mediaMsgData } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id,
          role: 'companion',
          content: null,
          media_type: 'video',
          media_status: 'generating',
          media_prompt: message,
        })
        .select('*')
        .single();
      mediaMsg = mediaMsgData;
    }

    // Update relationship last_talked_at
    await supabase
      .from('companion_relationships')
      .upsert({
        user_id: user.id,
        archetype_id,
        last_talked_at: new Date().toISOString(),
      }, { onConflict: 'user_id,archetype_id' });

    const insertedMessageCount = [userMsg, companionMsg, mediaMsg].filter(Boolean).length;
    const completedAt = new Date().toISOString();
    const { error: conversationUpdateError } = await supabase
      .from('conversations')
      .update({
        last_message_at: completedAt,
        message_count: (conversation.message_count ?? 0) + insertedMessageCount,
        updated_at: completedAt,
      })
      .eq('id', conversation_id)
      .eq('user_id', user.id);

    if (conversationUpdateError) {
      console.error('Chat conversation update error:', JSON.stringify(conversationUpdateError));
    }

    return NextResponse.json({
      userMessage: userMsg,
      companionMessage: companionMsg,
      mediaMessage: mediaMsg,
      wantsSelfie,
      wantsVideo,
    });
  } catch (error) {
    console.error('Chat send error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
