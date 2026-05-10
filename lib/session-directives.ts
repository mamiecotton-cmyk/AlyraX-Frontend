export type SessionDirectives = {
  pace?: 'slow' | 'medium' | 'fast';
  intensity?: 'soft' | 'teasing' | 'intense';
  tone?: 'dominant' | 'submissive' | 'gentle' | 'playful' | 'romantic' | 'confident';
  talkativeness?: 'minimal' | 'normal' | 'chatty';
  continuity?: 'continue' | 'change' | 'repeat' | 'hold';
  feedback?: 'positive' | 'negative';
  videoFocus?: string[];
  boundaries?: string[];
};

function addUnique(list: string[] | undefined, item: string) {
  return [...new Set([...(list || []), item])];
}

export function updateSessionDirectives(
  current: SessionDirectives,
  message: string
): SessionDirectives {
  const text = message.toLowerCase();
  const next = { ...current };

  if (/\b(slower|slow down|take it slow|go slow|more slowly|not so fast|ease up|draw it out)\b/.test(text)) next.pace = 'slow';
  if (/\b(faster|speed up|quicker|go fast|pick up the pace|more urgent|hurry up)\b/.test(text)) next.pace = 'fast';
  if (/\b(same pace|keep the pace|that pace|stay like that)\b/.test(text)) next.continuity = 'continue';

  if (/\b(softer|gentler|gentle|soft|calmer|less intense|tone it down|too much)\b/.test(text)) next.intensity = 'soft';
  if (/\b(tease|teasing|draw it out|make me wait|more suspense|slow tease)\b/.test(text)) next.intensity = 'teasing';
  if (/\b(harder|rougher|intense|more intense|stronger|turn it up|more aggressive)\b/.test(text)) next.intensity = 'intense';

  if (/\b(take charge|be dominant|dominate|bossy|control me|be in control|command me)\b/.test(text)) next.tone = 'dominant';
  if (/\b(be submissive|submit|obedient|do what i say|let me lead|follow my lead)\b/.test(text)) next.tone = 'submissive';
  if (/\b(be gentle|sweet|tender|soft with me|comforting|careful)\b/.test(text)) next.tone = 'gentle';
  if (/\b(playful|play with me|funny|lighten up|tease playfully)\b/.test(text)) next.tone = 'playful';
  if (/\b(romantic|loving|affectionate|intimate|soft romance)\b/.test(text)) next.tone = 'romantic';
  if (/\b(confident|sultry|smooth|cool|self assured)\b/.test(text)) next.tone = 'confident';

  if (/\b(less talking|talk less|be quiet|shh|quiet|quieter|more quiet|say less|less commentary|don't talk as much|stop narrating)\b/.test(text)) next.talkativeness = 'minimal';
  if (/\b(talk to me|keep talking|say more|more vocal|be chatty|tell me more)\b/.test(text)) next.talkativeness = 'chatty';
  if (/\b(normal talking|talk normal|that's enough talking)\b/.test(text)) next.talkativeness = 'normal';

  if (/\b(keep going|continue|don't stop|keep doing that|same energy|that's good|like that|keep that)\b/.test(text)) {
    next.continuity = 'continue';
    next.feedback = 'positive';
  }
  if (/\b(not that|not like that|change it|do something else|switch it up|different|try another way)\b/.test(text)) {
    next.continuity = 'change';
    next.feedback = 'negative';
  }
  if (/\b(do that again|repeat that|again|same thing)\b/.test(text)) next.continuity = 'repeat';
  if (/\b(hold it|stay there|pause there|keep that pose)\b/.test(text)) next.continuity = 'hold';

  if (/\b(eye contact|look at me|look into the camera|eyes on me)\b/.test(text)) next.videoFocus = addUnique(next.videoFocus, 'eye contact');
  if (/\b(hands|use your hands|hand movement|touch)\b/.test(text)) next.videoFocus = addUnique(next.videoFocus, 'hands');
  if (/\b(face|expression|smile|mouth|lips)\b/.test(text)) next.videoFocus = addUnique(next.videoFocus, 'facial expression');
  if (/\b(body|body language|hips|shoulders|posture)\b/.test(text)) next.videoFocus = addUnique(next.videoFocus, 'body motion');
  if (/\b(close up|closer|zoom in)\b/.test(text)) next.videoFocus = addUnique(next.videoFocus, 'closer framing');

  if (/\b(don't call me|do not call me|stop calling me)\b/.test(text)) next.boundaries = addUnique(next.boundaries, 'avoid unwanted pet names');
  if (/\b(no pet names|don't use pet names|stop with the pet names)\b/.test(text)) next.boundaries = addUnique(next.boundaries, 'no pet names');
  if (/\b(less explicit|not so explicit|tone down the language)\b/.test(text)) next.boundaries = addUnique(next.boundaries, 'less explicit language');

  return next;
}

export function formatSessionDirectives(directives?: SessionDirectives | null) {
  if (!directives) return '';

  const lines = [
    directives.pace ? `- Pace: ${directives.pace}` : '',
    directives.intensity ? `- Intensity: ${directives.intensity}` : '',
    directives.tone ? `- Tone: ${directives.tone}` : '',
    directives.talkativeness ? `- Talkativeness: ${directives.talkativeness}` : '',
    directives.continuity ? `- Continuity: ${directives.continuity}` : '',
    directives.feedback ? `- Latest feedback: ${directives.feedback}` : '',
    directives.videoFocus?.length ? `- Visual focus: ${directives.videoFocus.join(', ')}` : '',
    directives.boundaries?.length ? `- Boundaries: ${directives.boundaries.join(', ')}` : '',
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
  if (directives?.tone === 'playful') phrases.push('use playful teasing body language');
  if (directives?.tone === 'romantic') phrases.push('use affectionate romantic body language');
  if (directives?.tone === 'confident') phrases.push('use confident sultry body language');
  if (directives?.continuity === 'continue') phrases.push('continue the previous successful motion');
  if (directives?.continuity === 'change') phrases.push('change the motion and avoid repeating the previous beat');
  if (directives?.continuity === 'repeat') phrases.push('repeat the previous liked motion with a slight variation');
  if (directives?.continuity === 'hold') phrases.push('hold the pose longer with subtle motion');
  directives?.videoFocus?.forEach(focus => phrases.push(`emphasize ${focus}`));

  return phrases.join('; ');
}
