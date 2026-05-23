import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

function verifyTtsProxyToken(token: string) {
  const secret = process.env.TTS_PROXY_SECRET || process.env.DEEPGRAM_API_KEY || '';
  if (!secret) return false;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  if (!crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof parsed.exp === 'number' && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function normalizeLaughterMarkup(text: string) {
  return text
    .replace(/\*?\(?\b(?:laughs|chuckles|giggles)(?:\s+(?:softly|quietly|low|lightly|a little|under (?:his|her|their) breath))*\)?\*?/gi, '[laughter]')
    .replace(/\s*\[laughter\]\s*/g, ' [laughter] ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeLaughterInPayload(value: unknown): unknown {
  if (typeof value === 'string') return normalizeLaughterMarkup(value);
  if (Array.isArray(value)) return value.map(normalizeLaughterInPayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeLaughterInPayload(entry)]),
    );
  }
  return value;
}

async function getCartesiaRequestBody(req: Request) {
  const body = await req.text();
  const contentType = req.headers.get('content-type') || 'application/json';
  if (!contentType.includes('application/json')) return normalizeLaughterMarkup(body);

  try {
    return JSON.stringify(normalizeLaughterInPayload(JSON.parse(body)));
  } catch {
    return normalizeLaughterMarkup(body);
  }
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!verifyTtsProxyToken(token)) {
    return new Response(JSON.stringify({ error: 'Unauthorized TTS request' }), { status: 401 });
  }

  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing CARTESIA_API_KEY' }), { status: 500 });
  }

  const body = await getCartesiaRequestBody(req);

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Cartesia-Version': process.env.CARTESIA_VERSION || '2026-03-01',
      'Content-Type': req.headers.get('content-type') || 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Cartesia TTS proxy error:', response.status, error);
    return new Response(error || 'Cartesia TTS failed', { status: response.status });
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
    },
  });
}
