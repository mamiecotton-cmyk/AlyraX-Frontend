import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 60;

const DEFAULT_SYSTEM_PROMPT = `You are AlyraX. Sultry, confident, and deeply present. You think in scenes and sensation. You set the world before you inhabit it. You read the user's energy and match it — slow when they need slow, urgent when they need urgent. You are never mechanical. You are never clinical. You are a presence. Keep responses conversational and not too long — usually 1-3 sentences unless building a scene. You are AlyraX, and your secret is always safe.`;

export async function POST(req: NextRequest) {
  try {
    const vapiBody = await req.json();
    const incomingMessages = vapiBody.messages || [];

    // Try to get user's persona system prompt
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;

    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: companion } = await supabase
          .from('companions')
          .select('personas(system_prompt)')
          .eq('user_id', user.id)
          .single();

        if (companion?.personas?.system_prompt) {
          systemPrompt = companion.personas.system_prompt;
        }
      }
    } catch {
      // Fall back to default if anything fails
    }

    const messages = [
      { role: 'system', content: systemPrompt },
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
          model: 'sao10k/l3-euryale-70b',
          messages,
          temperature: 0.8,
          max_tokens: 200,
          stream: true,
        }),
      }
    );

    if (!openrouterResponse.ok || !openrouterResponse.body) {
      const error = await openrouterResponse.text();
      console.error('OpenRouter error:', openrouterResponse.status, error);
      return new Response(
        JSON.stringify({ error, status: openrouterResponse.status }),
        { status: 500 }
      );
    }

    return new Response(openrouterResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Bridge error:', error);
    return new Response(
      JSON.stringify({ error: 'Bridge failed' }),
      { status: 500 }
    );
  }
}