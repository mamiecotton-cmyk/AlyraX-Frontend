import { NextResponse } from 'next/server';

export async function POST() {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing DEEPGRAM_API_KEY' },
      { status: 500 }
    );
  }

  const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return NextResponse.json(
      { error: data.err_msg || data.error || 'Deepgram token request failed' },
      { status: response.status }
    );
  }

  return NextResponse.json(data);
}
