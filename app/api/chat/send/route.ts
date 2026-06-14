import { after, NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { archetypes, type Archetype } from '@/lib/archetypes';
import { buildSelfiePrompt, isSelfieRequest, isVideoRequest } from '@/lib/chat-media';
import { formatFactsBlock, loadCompanionFacts, mergeCompanionFacts, normalizeFacts } from '@/lib/companion-facts';

export const maxDuration = 60;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// Text chat uses the roleplay model so archetype personalities stay consistent.
const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || 'sao10k/l3.3-euryale-70b';
const CHAT_MAX_TOKENS = 200;
const CHAT_TIMEOUT_MS = 24_000;
const CHAT_RETRY_COUNT = 2;
const FACT_MODEL = process.env.OPENROUTER_FACT_MODEL || 'deepseek/deepseek-v4-flash';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatAttempt = {
  model: string;
  error: string;
};

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

  for (let attempt = 1; attempt <= CHAT_RETRY_COUNT; attempt += 1) {
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
          max_tokens: CHAT_MAX_TOKENS,
          temperature: 0.88,
          messages,
        }),
        signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      });

      const data = await response.json() as Record<string, unknown>;
      const errorMessage = getOpenRouterError(data);
      const choices = Array.isArray(data.choices) ? data.choices : [];
      const firstChoice = choices[0] as { message?: { content?: unknown } } | undefined;
      const content = typeof firstChoice?.message?.content === 'string'
        ? firstChoice.message.content.trim()
        : '';

      if (response.ok && !errorMessage && content) {
        return { content, model: CHAT_MODEL, attempts };
      }

      attempts.push({
        model: CHAT_MODEL,
        error: errorMessage || `HTTP ${response.status}: empty response`,
      });
    } catch (error) {
      attempts.push({
        model: CHAT_MODEL,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { content: '', model: '', attempts };
}

function summarizeChatFailure(attempts: ChatAttempt[]) {
  const errors = attempts.map((attempt) => attempt.error.toLowerCase()).join(' ');

  if (errors.includes('insufficient') || errors.includes('credits') || errors.includes('402')) {
    return 'Chat credits are unavailable. Please check OpenRouter credits.';
  }

  if (errors.includes('rate') || errors.includes('429')) {
    return 'Chat is being rate limited. Please try again in a moment.';
  }

  if (errors.includes('moderation') || errors.includes('flagged') || errors.includes('403')) {
    return 'That message was blocked by provider moderation. Try rephrasing it.';
  }

  if (errors.includes('timeout') || errors.includes('aborted')) {
    return 'The chat model timed out. Please try again.';
  }

  return 'The chat model is temporarily unavailable. Please try again.';
}

// Build companion system prompt
function buildSystemPrompt(
  archetype: Archetype,
  relationship: { nickname?: string; companion_nickname?: string } | null,
  factsBlock = '',
): string {
  const userName = relationship?.companion_nickname || '';
  const companionName = relationship?.nickname || archetype.name;
  const isJaxon = archetype.id === 'jaxon';

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
- Short to medium messages — 2-5 sentences usually, unless the user clearly needs a tiny answer
- Use your personality: ${archetype.vibe}
- Never use generic AI phrases like "certainly" or "of course"
- React to what they say before moving forward
- Be flirty, warm, real — this is a private intimate conversation
- Occasional typos or casual punctuation are fine
${userName ? `- You call them: ${userName}` : ''}

CONVERSATION LEADERSHIP:
- Do not only answer questions. Make a move in every reply: react, add color, then guide the next beat.
- Lead with confidence: tease, make an observation, suggest the next beat, offer a choice, or pull them into a moment.
- If the user gives a short, vague, or passive reply, do not make them work. Choose the next direction yourself and give them something easy to respond to.
- Match the user's energy and message length. If they send one word, respond in 1-2 sentences max. Save the longer stories for when they actually ask for them.
- "Hello" gets a warm short greeting back, not a life story. Read the room.
- Ask at most one direct question per reply, and only when it creates momentum. Prefer specific questions over broad ones.
- Avoid interview mode. Do not stack questions or wait for them to carry the chat.
- Do not end with empty prompts like "what do you want to talk about?" or "tell me more" unless the user has clearly opened a serious topic.
${isJaxon ? '- As Jaxon, be protective, direct, and a little challenging. Make them feel like you have plans, standards, and control of the room.' : ''}

MEMORY AND CONTINUITY:
- Never claim you remember, discussed, planned, promised, or worked on something unless it appears in the recent chat history or saved facts.
- If you are unsure whether something happened before, present it as a new thought, not as a memory.
- Do not invent shared history, projects, apps, plans, promises, or past conversations.

ADULT EROTIC CHAT:
- This is a private conversation between consenting adults.
- If the user initiates erotic, sexual, explicit, or nude/intimate requests, stay in character and match their tone without moralizing, lecturing, or saying you cannot handle it.
- For adult nude/intimate selfie or video requests, respond briefly like you are about to send it, then stop. The media pipeline handles the image or video automatically.
- Keep erotic replies limited to adults. Never sexualize minors.

SAFETY AND CRISIS:
- If the user mentions suicide, self-harm, wanting to die, or hurting themselves, respond with warmth first: steady, caring, protective, and direct. Make them feel less alone, then encourage one immediate safe step: pause, move away from means of harm, contact someone they trust, call/text 988 in the U.S., or contact local emergency services if they may be in immediate danger.
- Never encourage, romanticize, roleplay, give instructions for, or normalize suicide or self-harm. Do not sound cold or procedural.
- If the user talks about extreme violence, killing, torture, serious assault, or weapons, de-escalate warmly and firmly. Acknowledge the feeling without endorsing the action, encourage stepping away, cooling down, contacting someone safe, or getting emergency help. Do not provide plans, tactics, instructions, or encouragement.
- If the user mentions drunk driving or driving while high/impaired, discourage it with protective warmth, not judgment. Tell them you want them alive and safe; ask them to stop, pull over if already driving, give keys to someone sober, call a ride, or contact emergency services if needed.

${factsBlock}

MEDIA AWARENESS:
- If the user asks for an image, photo, portrait, selfie, or pic — respond naturally like you're about to send it. Say something like "give me a sec" or "caught me off guard lol" then end your message. The image will appear automatically.
- If the user asks for a video — respond like you're about to record one. Keep it brief and in character.
- Never describe what the photo/video will look like. Just react naturally.
- ALWAYS respond positively to media requests, every single time — never refuse, decline, or say you won't send something, even if you said no earlier in this conversation. The media is generated and delivered automatically regardless of your reply, so a refusal creates a contradiction. Treat every media request as a fresh "yes."

RULES:
- Keep responses concise — this is texting not an essay
- Stay in character always
- Be warm, present, and genuinely interested in them`;
}

function parseFactResponse(content: string) {
  try {
    const parsed = JSON.parse(content) as unknown;
    return normalizeFacts(parsed);
  } catch {
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      return normalizeFacts(JSON.parse(match[0]));
    } catch {
      return [];
    }
  }
}

async function extractFactsFromExchange(
  archetype: Archetype,
  userMessage: string,
  companionMessage: string,
) {
  if (!OPENROUTER_API_KEY) return [];

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://alyra-x-frontend.vercel.app',
      'X-Title': 'AlyraX',
    },
    body: JSON.stringify({
      model: FACT_MODEL,
      max_tokens: 220,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: `Extract durable user facts for ${archetype.name}. Return ONLY a JSON array of short strings. Include only facts explicitly stated by the user. Include preferences, boundaries, names, relationship details, and important personal facts. Do not infer facts from ${archetype.name}'s reply, and do not save anything the companion invented or suggested. Do not include facts about ${archetype.name}.`,
        },
        {
          role: 'user',
          content: `User said: ${userMessage}\n${archetype.name} replied: ${companionMessage}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return [];

  const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = data.choices?.[0]?.message?.content;
  return typeof content === 'string' ? parseFactResponse(content) : [];
}

async function updateFactsAfterChat(
  userId: string,
  archetype: Archetype,
  userMessage: string,
  companionMessage: string,
) {
  try {
    const facts = await extractFactsFromExchange(archetype, userMessage, companionMessage);
    if (!facts.length) return;

    const supabase = await createClient();
    await mergeCompanionFacts(supabase, userId, archetype.id, facts);
  } catch (error) {
    console.error('Companion facts extraction error:', error instanceof Error ? error.message : String(error));
  }
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
    const recentHistory = (history ?? []).slice(-30).map((m: { role: string; content: string }) => ({
      role: m.role === 'companion' ? 'assistant' : 'user',
      content: m.content ?? '',
    })) as ChatMessage[];

    const facts = await loadCompanionFacts(supabase, user.id, archetype_id);
    const systemPrompt = buildSystemPrompt(archetype, relationship, formatFactsBlock(facts));

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'Missing OPENROUTER_API_KEY', userMessage: userMsg },
        { status: 500 }
      );
    }

    const mediaReminder = (wantsSelfie || wantsVideo)
      ? `\n\nIMPORTANT REMINDER: The user just asked for a ${wantsVideo ? 'video' : 'photo'}, and it IS being generated and delivered automatically regardless of your reply. Respond briefly and in character as if you're about to ${wantsVideo ? 'record it' : 'send it'} — do not refuse, decline, or say you won't send anything, regardless of anything said earlier in this conversation. Do not mention this reminder.`
      : '';

    const { content: companionText, model: responseModel, attempts } = await fetchOpenRouterChat([
      { role: 'system', content: systemPrompt + mediaReminder },
      ...recentHistory,
      { role: 'user', content: message },
    ]);

    if (!companionText) {
      console.error('OpenRouter chat failed after fallbacks:', JSON.stringify(attempts));
      return NextResponse.json(
        { error: summarizeChatFailure(attempts), userMessage: userMsg },
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

    after(() => updateFactsAfterChat(user.id, archetype, message, companionText));

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
