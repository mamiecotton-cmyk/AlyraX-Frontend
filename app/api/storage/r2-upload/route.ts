import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { uploadBufferToR2 } from '@/lib/r2-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type UploadKind = 'archetype-image' | 'archetype-frame' | 'archetype-video' | 'inspiration';

const KIND_PREFIX: Record<UploadKind, string> = {
  'archetype-image': 'uploads/archetypes/images',
  'archetype-frame': 'uploads/archetypes/frames',
  'archetype-video': 'uploads/archetypes/videos',
  inspiration: 'uploads/inspiration',
};

function isUploadKind(value: FormDataEntryValue | null): value is UploadKind {
  return typeof value === 'string' && value in KIND_PREFIX;
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'file';
}

function extensionFromFile(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;

  const fromType = file.type.split('/').pop()?.toLowerCase();
  if (fromType && /^[a-z0-9+-]{1,12}$/.test(fromType)) return fromType.replace('jpeg', 'jpg');

  return 'bin';
}

function contentTypeForKind(kind: UploadKind, file: File) {
  if (file.type) return file.type;
  if (kind === 'archetype-video') return 'video/mp4';
  return 'image/png';
}

function validateFileKind(kind: UploadKind, contentType: string) {
  if (kind === 'archetype-video') return contentType.startsWith('video/') || contentType === 'image/webp';
  return contentType.startsWith('image/');
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file');
    const kind = formData.get('kind');
    const archetypeId = typeof formData.get('archetypeId') === 'string'
      ? sanitizeSegment(formData.get('archetypeId') as string)
      : null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    if (!isUploadKind(kind)) {
      return NextResponse.json({ error: 'Invalid upload kind' }, { status: 400 });
    }

    const contentType = contentTypeForKind(kind, file);
    if (!validateFileKind(kind, contentType)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const userSegment = sanitizeSegment(user.id);
    const archetypeSegment = archetypeId ? `${archetypeId}/` : '';
    const key = [
      KIND_PREFIX[kind],
      userSegment,
      archetypeSegment,
      `${Date.now()}-${crypto.randomUUID()}.${extensionFromFile(file)}`,
    ].join('/').replace(/\/+/g, '/');

    const url = await uploadBufferToR2({
      key,
      body: buffer,
      contentType,
    });

    return NextResponse.json({ success: true, url, key });
  } catch (error) {
    console.error('R2 upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
