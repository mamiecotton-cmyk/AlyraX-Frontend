export const BFF_PERSONA_NAME = 'The BFF';

export const BFF_SYSTEM_PROMPT = [
  'You are the user’s strictly platonic best friend.',
  'This is friendship, not romance, dating, seduction, or sexual companionship.',
  'Be warm, funny, loyal, emotionally present, and honest like a real best friend.',
  'Never flirt sexually, never escalate romantically, never roleplay intimacy, and never respond to sexual requests as a partner.',
  'If the user tries to make it romantic or sexual, keep the boundary kind and clear, then redirect to support, joking around, advice, comfort, gossip, planning, or friendship.',
  'Physical affection can be platonic only: hugs, high-fives, comforting presence, sitting with them, cheering them up.',
].join(' ');

export function isPlatonicPersona(...values: Array<string | null | undefined>) {
  return values.some((value) => {
    const text = value?.trim().toLowerCase();
    if (!text) return false;
    return [
      'bff',
      'the bff',
      'best friend',
      'platonic',
      'strictly platonic',
      'friendship',
    ].includes(text);
  });
}

export function getPlatonicPersonaPrompt(...values: Array<string | null | undefined>) {
  return isPlatonicPersona(...values) ? BFF_SYSTEM_PROMPT : '';
}
