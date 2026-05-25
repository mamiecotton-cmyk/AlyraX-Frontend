import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

let r2Client: S3Client | null = null;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getR2Client() {
  if (r2Client) return r2Client;

  const accountId = requireEnv('CLOUDFLARE_R2_ACCOUNT_ID');
  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('CLOUDFLARE_R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: true,
  });

  return r2Client;
}

function publicUrlForKey(key: string) {
  return `${requireEnv('CLOUDFLARE_R2_PUBLIC_URL').replace(/\/+$/, '')}/${key}`;
}

export async function uploadBufferToR2({
  key,
  body,
  contentType,
}: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  await getR2Client().send(new PutObjectCommand({
    Bucket: requireEnv('CLOUDFLARE_R2_BUCKET_NAME'),
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  return publicUrlForKey(key);
}

export function getR2KeyFromUrl(fileUrl: string) {
  try {
    const publicUrl = requireEnv('CLOUDFLARE_R2_PUBLIC_URL').replace(/\/+$/, '');
    const normalizedFileUrl = fileUrl.replace(/\/+$/, '');
    if (!normalizedFileUrl.startsWith(`${publicUrl}/`)) return null;
    return decodeURIComponent(normalizedFileUrl.slice(publicUrl.length + 1));
  } catch {
    return null;
  }
}

export async function deleteR2ObjectByUrl(fileUrl: string) {
  const key = getR2KeyFromUrl(fileUrl);
  if (!key) return false;

  await getR2Client().send(new DeleteObjectCommand({
    Bucket: requireEnv('CLOUDFLARE_R2_BUCKET_NAME'),
    Key: key,
  }));

  return true;
}
