import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { type CompanionMemoryMap } from '@/lib/companion-memory';

type ChatMessage = {
  role?: string;
  content?: string;
};

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
      .select('id')
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

    return NextResponse.json({ success: true, memory: nextMemories[companionId] });
  } catch (error) {
    console.error('Companion memory save error:', error);
    return NextResponse.json({ error: 'Companion memory save failed' }, { status: 500 });
  }
}
