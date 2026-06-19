export type SessionDirectives = {
  pace?: 'slow' | 'medium' | 'fast';
  intensity?: 'soft' | 'teasing' | 'intense';
  tone?: 'dominant' | 'submissive' | 'gentle' | 'playful' | 'romantic' | 'confident';
  talkativeness?: 'minimal' | 'normal' | 'chatty';
  continuity?: 'continue' | 'change' | 'repeat' | 'hold';
  feedback?: 'positive' | 'negative';
  sceneMode?: 'casual' | 'scene';
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

  if (/\b(imagine|picture this|let'?s say|pretend|roleplay|role play|you'?re|i'?m laying|i walk|tell me a story|describe|paint me|set the scene|what would you do|take me there|keep going|don'?t stop|more|tell me more|talk to me|touch me|kiss me|come here|get on|take off|i want you|i need you|on top|inside|harder|closer|undress|naked|in bed|lay with me|make love)\b/.test(text)) {
    next.sceneMode = 'scene';
  }
  if (/\b(stop|wait|hold on|let'?s talk|real quick|question|nevermind|never mind|change the subject|that'?s enough|okay bye|i gotta go|back to|seriously)\b/.test(text)) {
    next.sceneMode = 'casual';
  }

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
    directives.sceneMode === 'scene'
      ? '- Length: this is an active scene — let your response run longer and more descriptive. Narrate the moment, build it out. No sentence limit; match the depth of what is happening.'
      : directives.sceneMode === 'casual'
        ? '- Length: casual back-and-forth — keep it to 1-3 short sentences.'
        : '',
    directives.videoFocus?.length ? `- Visual focus: ${directives.videoFocus.join(', ')}` : '',
    directives.boundaries?.length ? `- Boundaries: ${directives.boundaries.join(', ')}` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

export function buildVideoDirectivePhrase(directives?: SessionDirectives | null) {
  const phrases: string[] = [];

  if (directives?.pace === 'slow') phrases.push('slow');
  if (directives?.pace === 'fast') phrases.push('faster');
  if (directives?.intensity === 'soft') phrases.push('soft');
  if (directives?.intensity === 'teasing') phrases.push('tease');
  if (directives?.intensity === 'intense') phrases.push('intense');
  if (directives?.tone === 'dominant') phrases.push('controlled');
  if (directives?.tone === 'submissive') phrases.push('responsive');
  if (directives?.tone === 'gentle') phrases.push('gentle');
  if (directives?.tone === 'playful') phrases.push('playful');
  if (directives?.tone === 'romantic') phrases.push('romantic');
  if (directives?.tone === 'confident') phrases.push('confident');
  if (directives?.continuity === 'continue') phrases.push('continue');
  if (directives?.continuity === 'change') phrases.push('new motion');
  if (directives?.continuity === 'repeat') phrases.push('repeat variation');
  if (directives?.continuity === 'hold') phrases.push('hold pose');
  directives?.videoFocus?.forEach(focus => phrases.push(focus));

  return phrases.join('; ');
}
