export type CompanionMemory = {
  summary?: string;
  lastUserMessage?: string;
  lastAssistantMessage?: string;
  updatedAt?: string;
  mode?: string;
};

export type CompanionMemoryMap = Record<string, CompanionMemory>;

type UserMetadata = {
  full_name?: string;
  name?: string;
  user_name?: string;
  preferred_name?: string;
  email?: string;
  alyrax_user_name?: string;
  alyrax_memories?: CompanionMemoryMap;
};

export function getUserDisplayName(metadata?: UserMetadata | null, email?: string | null) {
  const rawName = metadata?.alyrax_user_name
    || metadata?.preferred_name
    || metadata?.full_name
    || metadata?.name
    || metadata?.user_name
    || email
    || metadata?.email
    || '';

  // Strip email domain if present
  const beforeAt = rawName.includes('@') ? rawName.split('@')[0] : rawName;

  // Normalize separators to spaces, then take ONLY the first token (first name)
  const normalized = beforeAt.replace(/[._-]+/g, ' ').trim();
  const firstName = normalized.split(/\s+/)[0] || '';

  return firstName;
}

export function getCompanionMemory(
  metadata: UserMetadata | undefined | null,
  companionId?: string | null
) {
  if (!companionId) return null;
  return metadata?.alyrax_memories?.[companionId] || null;
}

export function formatCompanionMemory(memory?: CompanionMemory | null, userName?: string | null) {
  if (!memory?.summary && !memory?.lastUserMessage && !memory?.lastAssistantMessage) return '';

  return [
    userName ? `User's first name: ${userName} (use only this name — never their full name)` : '',
    memory.summary ? `Last chat memory: ${memory.summary}` : '',
    memory.lastUserMessage ? `Last thing the user asked for: ${memory.lastUserMessage}` : '',
    memory.lastAssistantMessage ? `Last companion direction: ${memory.lastAssistantMessage}` : '',
  ].filter(Boolean).join('\n');
}