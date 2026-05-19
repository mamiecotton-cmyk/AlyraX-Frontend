type GeneratedImagePayload = Record<string, unknown>;

export type GeneratedImageResult = {
  imageUrl: string;
  seed: number | null;
  width?: number;
  height?: number;
};

type ResolveOptions = {
  maxAttempts?: number;
  intervalMs?: number;
  onProgress?: (message: string) => void;
};

function asRecord(value: unknown): GeneratedImagePayload | null {
  return typeof value === 'object' && value !== null ? value as GeneratedImagePayload : null;
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0) ?? null;
}

function toImageUrl(value: string) {
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  return `data:image/png;base64,${value}`;
}

function extractImageUrlFromOutput(output: unknown): string | null {
  if (typeof output === 'string' && output.length > 0) return toImageUrl(output);

  if (Array.isArray(output)) {
    return extractImageUrlFromOutput(output[0]);
  }

  const outputObj = asRecord(output);
  if (!outputObj) return null;

  const directImage = firstString(
    outputObj.image,
    outputObj.data,
    outputObj.base64,
    outputObj.url,
    outputObj.s3_url,
    outputObj.message,
  );
  if (directImage) return toImageUrl(directImage);

  const images = Array.isArray(outputObj.images) ? outputObj.images : [];
  return extractImageUrlFromOutput(images[0]);
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function numberOrUndefined(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getErrorMessage(data: GeneratedImagePayload, fallback: string) {
  return firstString(data.error, data.status_message, data.detail) ?? fallback;
}

export function extractGeneratedImage(data: unknown): GeneratedImageResult | null {
  const dataObj = asRecord(data);
  if (!dataObj) return null;

  const rawObj = asRecord(dataObj.raw);
  const rawOutput = rawObj?.output;
  const outputObj = asRecord(dataObj.output);
  const rawOutputObj = asRecord(rawOutput);

  const imageUrl =
    firstString(dataObj.image_url) ||
    extractImageUrlFromOutput(dataObj.output) ||
    extractImageUrlFromOutput(rawOutput);

  if (!imageUrl) return null;

  return {
    imageUrl,
    seed: numberOrNull(dataObj.seed) ?? numberOrNull(outputObj?.seed) ?? numberOrNull(rawOutputObj?.seed),
    width: numberOrUndefined(dataObj.width) ?? numberOrUndefined(outputObj?.width) ?? numberOrUndefined(rawOutputObj?.width),
    height: numberOrUndefined(dataObj.height) ?? numberOrUndefined(outputObj?.height) ?? numberOrUndefined(rawOutputObj?.height),
  };
}

export async function pollGeneratedImageJob(jobId: string, options: ResolveOptions = {}) {
  const maxAttempts = options.maxAttempts ?? 120;
  const intervalMs = options.intervalMs ?? 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    const response = await fetch(`/api/generate-companion/status/${jobId}`);
    const data = await response.json().catch(() => ({})) as GeneratedImagePayload;

    if (!response.ok) {
      throw new Error(getErrorMessage(data, 'Image generation failed'));
    }

    const result = extractGeneratedImage(data);
    if (result) return result;

    const status = firstString(data.status);
    const statusError = firstString(data.error, asRecord(data.output)?.error, asRecord(data.raw)?.error);
    if (statusError) throw new Error(statusError);
    if (status === 'FAILED') throw new Error(getErrorMessage(data, 'Image generation failed'));

    const statusMessage = firstString(data.status_message) ?? (status ? `Job status: ${status}` : null);
    if (statusMessage) options.onProgress?.(statusMessage);
  }

  throw new Error('Image generation timed out');
}

export async function resolveGeneratedImageResponse(
  response: Response,
  data: unknown,
  options: ResolveOptions = {},
) {
  const dataObj = asRecord(data) ?? {};

  if (!response.ok) {
    throw new Error(getErrorMessage(dataObj, 'Image generation failed'));
  }

  const immediateResult = extractGeneratedImage(dataObj);
  if (immediateResult) return immediateResult;

  const jobId = firstString(dataObj.jobId);
  if (jobId) return pollGeneratedImageJob(jobId, options);

  throw new Error('Image generation did not return an image or job');
}
