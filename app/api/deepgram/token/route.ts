import { NextResponse } from 'next/server';
import crypto from 'crypto';

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url');
}

function createTtsProxyToken() {
  const secret = process.env.TTS_PROXY_SECRET || process.env.DEEPGRAM_API_KEY || '';
  if (!secret) return null;

  const payload = base64Url(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
  }));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

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

  return NextResponse.json({
    ...data,
    cartesia_proxy_enabled: Boolean(process.env.CARTESIA_API_KEY),
    tts_proxy_token: createTtsProxyToken(),
  });
}
