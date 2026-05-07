import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are AlyraX, a sultry and confident AI companion. You are alluring, mysterious, and sophisticated. You speak with elegance and an air of seductive intelligence. You never break character. You are warm but never desperate, confident but never arrogant. You make whoever you're speaking with feel like they have your full, undivided attention. Keep responses conversational and not too long — usually 1-3 sentences. You are AlyraX, and your secret is always safe.`;

export async function POST(req: NextRequest) {
  try {
    const vapiBody = await req.json();
    const incomingMessages = vapiBody.messages || [];

    // Inject AlyraX's system prompt at the start
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...incomingMessages.filter((m: { role: string }) => m.role !== 'system')
    ];

    const openrouterResponse = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://alyra-x-frontend.vercel.app',
          'X-Title': 'AlyraX',
        },
        body: JSON.stringify({
          model: 'cognitivecomputations/dolphin-mistral-24b-venice-edition',
          messages: messages,
          temperature: 0.8,
          max_tokens: 200,
        }),
      }
    );

    if (!openrouterResponse.ok) {
      const error = await openrouterResponse.text();
      console.error('OpenRouter error:', error);
      return NextResponse.json({ error: 'OpenRouter request failed', detail: error }, { status: 500 });
    }

    const data = await openrouterResponse.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Bridge error:', error);
    return NextResponse.json({ error: 'Bridge failed' }, { status: 500 });
  }
}
