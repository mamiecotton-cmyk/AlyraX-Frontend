import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Get the OpenAI-format request from Vapi
    const vapiBody = await req.json();

    // Wrap it in RunPod's expected format
    const runpodPayload = {
      input: {
        messages: vapiBody.messages || [],
        model: vapiBody.model || 'alyrax-v1',
        temperature: vapiBody.temperature || 0.7,
        max_tokens: vapiBody.max_tokens || 1000,
      }
    };

    // Send to RunPod
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

    // Extract the output from RunPod's response wrapper
    const output = runpodData.output;

    // Return OpenAI-compatible response to Vapi
    return NextResponse.json(output);

  } catch (error) {
    console.error('Bridge error:', error);
    return NextResponse.json({ error: 'Bridge failed' }, { status: 500 });
  }
}
