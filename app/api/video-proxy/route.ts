import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  const download = req.nextUrl.searchParams.get('download');
  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  if (sourceUrl.protocol !== 'https:') {
    return NextResponse.json({ error: 'Unsupported url protocol' }, { status: 400 });
  }

  const range = req.headers.get('range');
  const upstream = await fetch(sourceUrl, {
    headers: range ? { range } : undefined,
  });

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: 'Video fetch failed' },
      { status: upstream.status || 502 }
    );
  }

  const headers = new Headers();
  const passthroughHeaders = [
    'accept-ranges',
    'content-length',
    'content-range',
    'content-type',
  ];

  for (const header of passthroughHeaders) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }

  headers.set('cache-control', 'private, max-age=300');
  if (download) {
    const filename = download.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    headers.set('content-disposition', `attachment; filename="${filename}"`);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
