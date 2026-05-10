export type SessionDirectives = {
  pace?: 'slow' | 'fast';
  intensity?: 'soft' | 'teasing' | 'intense';
  tone?: 'dominant' | 'submissive' | 'gentle';
  talkativeness?: 'low' | 'normal';
};

export function updateSessionDirectives(
  current: SessionDirectives,
  message: string
): SessionDirectives {
  const text = message.toLowerCase();
  const next = { ...current };

  if (/\b(slower|slow down|take it slow|go slow|more slowly)\b/.test(text)) next.pace = 'slow';
  if (/\b(faster|speed up|quicker|go fast)\b/.test(text)) next.pace = 'fast';

  if (/\b(softer|gentler|gentle|soft)\b/.test(text)) next.intensity = 'soft';
  if (/\b(tease|teasing|draw it out|make me wait)\b/.test(text)) next.intensity = 'teasing';
  if (/\b(harder|rougher|intense|more intense|stronger)\b/.test(text)) next.intensity = 'intense';

  if (/\b(take charge|be dominant|dominate|bossy|control me)\b/.test(text)) next.tone = 'dominant';
  if (/\b(be submissive|submit|obedient|do what i say)\b/.test(text)) next.tone = 'submissive';
  if (/\b(be gentle|sweet|tender|soft with me)\b/.test(text)) next.tone = 'gentle';

  if (/\b(less talking|talk less|be quiet|shh|quiet)\b/.test(text)) next.talkativeness = 'low';
  if (/\b(talk to me|keep talking|say more)\b/.test(text)) next.talkativeness = 'normal';

  return next;
}

export function formatSessionDirectives(directives?: SessionDirectives | null) {
  if (!directives) return '';

  const lines = [
    directives.pace ? `- Pace: ${directives.pace}` : '',
    directives.intensity ? `- Intensity: ${directives.intensity}` : '',
    directives.tone ? `- Tone: ${directives.tone}` : '',
    directives.talkativeness ? `- Talkativeness: ${directives.talkativeness}` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

export function buildVideoDirectivePhrase(directives?: SessionDirectives | null) {
  const phrases: string[] = [];

  if (directives?.pace === 'slow') phrases.push('move slowly with drawn-out pacing');
  if (directives?.pace === 'fast') phrases.push('move faster with more urgency');
  if (directives?.intensity === 'soft') phrases.push('keep the motion soft and gentle');
  if (directives?.intensity === 'teasing') phrases.push('make the motion teasing and delayed');
  if (directives?.intensity === 'intense') phrases.push('make the motion more intense');
  if (directives?.tone === 'dominant') phrases.push('use confident controlled body language');
  if (directives?.tone === 'submissive') phrases.push('use eager responsive body language');
  if (directives?.tone === 'gentle') phrases.push('use tender relaxed body language');

  return phrases.join('; ');
}
