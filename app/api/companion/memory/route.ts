import { after, NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { type CompanionMemoryMap } from '@/lib/companion-memory';
import { mergeCompanionFacts, normalizeFacts } from '@/lib/companion-facts';

type ChatMessage = {
  role?: string;
  content?: string;
};

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const FACT_MODEL = process.env.OPENROUTER_FACT_MODEL || 'deepseek/deepseek-v4-flash';

function cleanText(value?: string) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function clip(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function buildMemory(messages: ChatMessage[], mode?: string) {
  const cleanMessages = messages
    .map(message => ({
      role: message.role,
      content: cleanText(message.content),
    }))
    .filter(message => message.content && (message.role === 'user' || message.role === 'assistant'))
    .slice(-10);

  const lastUserMessage = [...cleanMessages].reverse().find(message => message.role === 'user')?.content || '';
  const lastAssistantMessage = [...cleanMessages].reverse().find(message => message.role === 'assistant')?.content || '';
  const userRequests = cleanMessages
    .filter(message => message.role === 'user')
    .map(message => message.content)
    .slice(-3)
    .join(' ');

  const summaryParts = [
    userRequests ? `User recently wanted: ${clip(userRequests, 260)}` : '',
    lastAssistantMessage ? `Companion was leading with: ${clip(lastAssistantMessage, 260)}` : '',
  ].filter(Boolean);

  return {
    summary: clip(summaryParts.join(' '), 650),
    lastUserMessage: clip(lastUserMessage, 260),
    lastAssistantMessage: clip(lastAssistantMessage, 360),
    updatedAt: new Date().toISOString(),
    mode: mode || 'solo',
  };
}

function parseFactResponse(content: string) {
  try {
    return normalizeFacts(JSON.parse(content) as unknown);
  } catch {
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      return normalizeFacts(JSON.parse(match[0]) as unknown);
    } catch {
      return [];
    }
  }
}

async function extractFactsFromVoiceMessages(messages: ChatMessage[]) {
  if (!OPENROUTER_API_KEY) return [];

  const transcript = messages
    .map(message => ({
      role: message.role === 'assistant' ? 'Companion' : message.role === 'user' ? 'User' : '',
      content: cleanText(message.content),
    }))
    .filter(message => message.role && message.content)
    .slice(-24)
    .map(message => `${message.role}: ${message.content}`)
    .join('\n');

  if (!transcript) return [];

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
      max_tokens: 260,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: 'From this voice call transcript, extract durable personal facts the user shared about themselves. Return ONLY a JSON array of short strings. Include preferences, boundaries, names, relationship details, and important personal facts. Do not include facts about the companion.',
        },
        { role: 'user', content: transcript },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return [];

  const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = data.choices?.[0]?.message?.content;
  return typeof content === 'string' ? parseFactResponse(content) : [];
}

async function updateFactsAfterVoiceCall(userId: string, archetypeId: string, messages: ChatMessage[]) {
  try {
    const facts = await extractFactsFromVoiceMessages(messages);
    if (!facts.length) return;

    const supabase = await createClient();
    await mergeCompanionFacts(supabase, userId, archetypeId, facts);
  } catch (error) {
    console.error('Voice facts extraction error:', error instanceof Error ? error.message : String(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companionId, messages, mode } = await req.json();

    if (!companionId || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Missing companionId or messages' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: companion, error } = await supabase
      .from('companions')
      .select('id, archetype_id')
      .eq('id', companionId)
      .eq('user_id', user.id)
      .single();

    if (error || !companion) {
      return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
    }

    const currentMetadata = (user.user_metadata || {}) as Record<string, unknown> & {
      alyrax_memories?: CompanionMemoryMap;
    };
    const currentMemories = (currentMetadata.alyrax_memories || {}) as CompanionMemoryMap;
    const nextMemories: CompanionMemoryMap = {
      ...currentMemories,
      [companionId]: buildMemory(messages, mode),
    };

    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        ...currentMetadata,
        alyrax_memories: nextMemories,
      },
    });

    if (updateError) throw updateError;

    if (typeof companion.archetype_id === 'string') {
      after(() => updateFactsAfterVoiceCall(user.id, companion.archetype_id, messages));
    }

    return NextResponse.json({ success: true, memory: nextMemories[companionId] });
  } catch (error) {
    console.error('Companion memory save error:', error);
    return NextResponse.json({ error: 'Companion memory save failed' }, { status: 500 });
  }
}
