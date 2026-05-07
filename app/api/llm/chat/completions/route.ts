import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const vapiBody = await req.json();

    const runpodPayload = {
      input: {
        messages: vapiBody.messages || [],
        model: vapiBody.model || 'alyrax-v1',
        temperature: vapiBody.temperature || 0.7,
        max_tokens: vapiBody.max_tokens || 1000,
      }
    };

    const runpodResponse = await fetch(
      `https://api.runpod.ai/v2/${process.env.RUNPOD_ENDPOINT_ID}/runsync`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
        },
        body: JSON.stringify(runpodPayload),
      }
    );

    if (!runpodResponse.ok) {
      const error = await runpodResponse.text();
      console.error('RunPod error:', error);
      return NextResponse.json({ error: 'RunPod request failed' }, { status: 500 });
    }

    const runpodData = await runpodResponse.json();
    const output = runpodData.output;

    return NextResponse.json(output);

  } catch (error) {
    console.error('Bridge error:', error);
    return NextResponse.json({ error: 'Bridge failed' }, { status: 500 });
  }
}
