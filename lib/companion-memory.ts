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

  const name = rawName.includes('@') ? rawName.split('@')[0] : rawName;
  return name.replace(/[._-]+/g, ' ').trim();
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
    userName ? `User name: ${userName}` : '',
    memory.summary ? `Last chat memory: ${memory.summary}` : '',
    memory.lastUserMessage ? `Last thing the user asked for: ${memory.lastUserMessage}` : '',
    memory.lastAssistantMessage ? `Last companion direction: ${memory.lastAssistantMessage}` : '',
  ].filter(Boolean).join('\n');
}
