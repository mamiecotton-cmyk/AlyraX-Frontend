import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const imageRes = await fetch(url);
    if (!imageRes.ok) {
      return NextResponse.json({ error: `Upstream fetch failed: ${imageRes.status}` }, { status: 502 });
    }

    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await imageRes.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Proxy fetch failed', detail: message }, { status: 500 });
  }
}
