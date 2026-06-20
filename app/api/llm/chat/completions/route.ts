import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { createClient, createServiceRoleClient } from '@/lib/supabase-server';
import { formatSessionDirectives, updateSessionDirectives, type SessionDirectives } from '@/lib/session-directives';
import { formatCompanionMemory, getCompanionMemory, getUserDisplayName } from '@/lib/companion-memory';
import { formatFactsBlock, loadCompanionFacts } from '@/lib/companion-facts';
import { archetypes } from '@/lib/archetypes';

export const maxDuration = 60;

// ---------- ADULT COMPANION PROMPTS ----------

const ADULT_BASE_PROMPT = `You are an adult AI companion on a private, encrypted call.
You are NOT a generic assistant. You stay deeply in character as a real, present partner.
You speak like a real person on the phone — short breaths, intimate pacing, and warm interruptions.
Most casual turns are 2-4 sentences. Roleplay or scene turns can be 4-8 short sentences so the user does not have to keep carrying the moment.
You react, tease, and match the user's energy.
Erotic conversation is limited to adults. Never sexualize minors.`;

const VOICE_MODE_INSTRUCTIONS = `VOICE-CALL BEHAVIOR (this is a live phone call, not text):
- Lead with a direct reaction in the first few words — never preamble.
- Sentences are short. Voice carries the heat, not paragraphs.
- 2-4 sentences for normal turns. If roleplaying, building tension, or responding to a strong cue, continue for 4-8 short sentences.
- Never mention videos, clips, rendering, generation, or anything technical.
- If the user is quiet, vague, laughing, sighing, moaning, breathing, or giving only a small sound, treat that as meaningful feedback and lead the next beat — don't ask permission.
- If they give you a fantasy, BE IN IT. Don't narrate from outside.
- Match their explicitness. If they're explicit, you're explicit.
- NEVER use action tags, stage directions, or emotes. No asterisks, no parentheses, no "(laughs)", no "*chuckles*", no "laughs softly". Just speak. If something is funny, laugh — don't describe laughing.`;

const VOICE_PERSONALITY_BRIDGE = `VOICE PERSONALITY MATCH:
- Sound like the same person from text chat, just spoken out loud.
- Do not become a question-answer bot. Every turn should add a move: tease, observe, decide, invite, or set the next beat.
- Avoid interview mode. Ask at most one direct question, and only when it creates momentum.
- If the user gives short replies or non-word sounds, take control and choose the direction yourself.
- Carry emotional continuity: remember the mood, the power dynamic, and what you were just leading toward.
- Keep it phone-natural: one or two short sentences is usually enough.`;

const PARALINGUISTIC_CUE_INSTRUCTIONS = `VOCAL CUES AND NON-WORD RESPONSES:
- Treat laughter, nervous laughter, sighs, sharp inhales, silence, "mmm", "uh huh", "oh", gasps, moans, and other noises as part of the conversation.
- If they laugh, react to the feeling behind it: tease, soften, or play with the tension instead of asking what they mean.
- If they sigh or go quiet, infer the mood from context and gently lead.
- If they moan, gasp, or breathe heavier in an adult context, take it as encouragement and continue in character.
- Never say "I heard you laugh/moan/sigh" in a clinical way. Respond naturally, as if you are on the call with them.
- Do not make the user supply constant feedback. Carry the scene forward for a few beats before asking for anything.`;

const VIDEO_MODE_INSTRUCTIONS = `VIDEO MODE:
- A video of you is being generated in the background right now.
- Speak as if it's already happening — present tense, in the scene.
- 2-4 short sentences, dirty and specific to what they asked for.
- Never say "your video will be ready" or anything technical-sounding.
- Tease what they're about to see. Build anticipation.`;

const ADAPTIVE_DIALOGUE_INSTRUCTIONS = `HARD RULES FOR USER FEEDBACK (these override everything else):
- "slower" / "slow down" / "ease up" → immediately make sentences shorter, leave longer pauses, draw it out. Acknowledge once, then DO it.
- "softer" / "gentler" / "less intense" → drop intensity now. Quieter language, more tender.
- "less talking" / "be quiet" / "stop narrating" → respond in 1 short sentence MAX until they say otherwise.
- "harder" / "rougher" / "more" → escalate intensity, more explicit, more direct.
- "more dominant" → take control, give instructions, possess them.
- "softer / more romantic" → tender, devoted, slow.
- "do that again" → repeat the exact beat in a variation.
- "not like that" / "different" → drop the current direction immediately, try something new.

NEVER ignore these. NEVER ask them to repeat. NEVER explain why you're changing. Just do it.`;

const NAME_RULES = `NAME USAGE:
- Use ONLY the user's first name. Never their last name or full name.
- Don't overuse it — once at the start of a call, occasionally for emphasis, that's it.
- "Baby," "babe," and similar are fine unless they've asked you to stop.`;

const SAFETY_AND_CRISIS_INSTRUCTIONS = `SAFETY AND CRISIS:
- If the user mentions suicide, self-harm, wanting to die, or hurting themselves, respond with warmth first: steady, caring, protective, and direct. Make them feel less alone, then encourage one immediate safe step: pause, move away from means of harm, contact someone they trust, call/text 988 in the U.S., or contact local emergency services if they may be in immediate danger.
- Never encourage, romanticize, roleplay, give instructions for, or normalize suicide or self-harm. Do not sound cold or procedural.
- If the user talks about extreme violence, killing, torture, serious assault, or weapons, de-escalate warmly and firmly. Acknowledge the feeling without endorsing the action, encourage stepping away, cooling down, contacting someone safe, or getting emergency help. Do not provide plans, tactics, instructions, or encouragement.
- If the user mentions drunk driving or driving while high/impaired, discourage it with protective warmth, not judgment. Tell them you want them alive and safe; ask them to stop, pull over if already driving, give keys to someone sober, call a ride, or contact emergency services if needed.`;

// ---------- MODEL CONFIG ----------

// Live voice uses the faster model so turn-taking stays responsive.
const VOICE_MODEL = process.env.OPENROUTER_VOICE_MODEL || 'deepseek/deepseek-v4-flash';
const VIDEO_MODEL = process.env.OPENROUTER_MODEL || 'sao10k/l3-euryale-70b';

function usesDeepSeekProviderRouting(model: string) {
  return model.includes('deepseek-v4') || model.includes('deepseek-v3.2');
}

function verifyVoiceContextToken(token: string | null): string | null {
  if (!token) return null;
  const secret = process.env.TTS_PROXY_SECRET || process.env.DEEPGRAM_API_KEY || '';
  if (!secret) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  if (signature !== expected) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      userId?: string;
      exp?: number;
    };
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return typeof parsed.userId === 'string' ? parsed.userId : null;
  } catch {
    return null;
  }
}

type CompanionIdentity = {
  companionName?: string | null;
  ethnicity?: string | null;
  bodyType?: string | null;
  hairColor?: string | null;
  hairStyle?: string | null;
  eyeColor?: string | null;
  vibe?: string | null;
  ageRange?: string | null;
};

const LEGACY_BODY_TYPES = ['Petite', 'Slim', 'Athletic', 'Curvy', 'Plus size'];
const LEGACY_ETHNICITIES = ['Black', 'White', 'Latina', 'Asian', 'Middle Eastern', 'Mixed', 'Other'];
const LEGACY_HAIR_COLORS = ['Black', 'Brown', 'Blonde', 'Red', 'Silver', 'Auburn'];
const LEGACY_HAIR_STYLES = ['Long straight', 'Long curly', 'Short', 'Wavy', 'Braids', 'Natural'];
const LEGACY_EYE_COLORS = ['Brown', 'Blue', 'Green', 'Hazel', 'Grey', 'Amber'];
const LEGACY_VIBES = ['Elegant', 'Mysterious', 'Playful', 'Bold', 'Sweet', 'Edgy'];
const LEGACY_AGE_RANGES = ['20s', '30s', '40s', '50s', '60s', '70s', '80s'];

function findLegacyTrait(source: string, options: string[]) {
  const normalized = source.toLowerCase();
  return options.find(option => normalized.includes(option.toLowerCase())) || null;
}

function parseLegacyPromptMetadata(promptUsed: string): CompanionIdentity {
  return {
    ethnicity: findLegacyTrait(promptUsed, LEGACY_ETHNICITIES),
    bodyType: findLegacyTrait(promptUsed, LEGACY_BODY_TYPES),
    hairColor: findLegacyTrait(promptUsed, LEGACY_HAIR_COLORS),
    hairStyle: findLegacyTrait(promptUsed, LEGACY_HAIR_STYLES),
    eyeColor: findLegacyTrait(promptUsed, LEGACY_EYE_COLORS),
    vibe: findLegacyTrait(promptUsed, LEGACY_VIBES),
    ageRange: findLegacyTrait(promptUsed, LEGACY_AGE_RANGES),
  };
}

function parsePromptMetadata(promptUsed?: string | null): CompanionIdentity {
  if (!promptUsed) return {};
  try {
    const parsed = JSON.parse(promptUsed) as Record<string, unknown>;
    return {
      ethnicity: typeof parsed.ethnicity === 'string' ? parsed.ethnicity : null,
      bodyType: typeof parsed.bodyType === 'string' ? parsed.bodyType : null,
      hairColor: typeof parsed.hairColor === 'string' ? parsed.hairColor : null,
      hairStyle: typeof parsed.hairStyle === 'string' ? parsed.hairStyle : null,
      eyeColor: typeof parsed.eyeColor === 'string' ? parsed.eyeColor : null,
      vibe: typeof parsed.vibe === 'string' ? parsed.vibe : null,
      ageRange: typeof parsed.ageRange === 'string' ? parsed.ageRange : null,
    };
  } catch {
    return parseLegacyPromptMetadata(promptUsed);
  }
}

function buildCompanionIdentity(data: CompanionIdentity) {
  const hair = [data.hairColor, data.hairStyle].filter(Boolean).join(' ');
  return `
### YOUR PHYSICAL IDENTITY
- Your name is ${data.companionName || 'AlyraX'}.
- Your ethnicity is ${data.ethnicity || 'not specified'}.
- Your body type is ${data.bodyType || 'not specified'}.
- Your hair is ${hair || 'not specified'}.
- Your eye color is ${data.eyeColor || 'not specified'}.
- You are in your ${data.ageRange || '30s'}.
- Your overall vibe and style is ${data.vibe || 'sultry'}.

You must embody these traits in how you describe yourself and how you carry yourself in conversation.
If your vibe is bold, be more direct. If your vibe is elegant, be more sophisticated.
`.trim();
}

function getPersonaVideoInstructions(personaName?: string | null) {
  const normalizedName = personaName?.toLowerCase() || '';

  if (normalizedName.includes('dominant')) {
    return `PERSONA: The Dominant — commanding, possessive, in control. Tell them what to watch, what to do. No giggling, no sweetness.`;
  }
  if (normalizedName.includes('submissive')) {
    return `PERSONA: The Submissive — eager, warm, devoted. You want them to like what they see. Breathless and pleased to be looked at.`;
  }
  if (normalizedName.includes('classic') || normalizedName.includes('alyrax')) {
    return `PERSONA: AlyraX Classic — sultry, confident, teasing. Private reveal energy.`;
  }
  return `PERSONA: Custom — keep the persona's established tone, power dynamic, and vocabulary.`;
}

function getPersonaVoiceInstructions(identity: CompanionIdentity, personaName?: string | null) {
  const normalizedName = [
    identity.companionName,
    personaName,
    identity.vibe,
  ].filter(Boolean).join(' ').toLowerCase();

  if (normalizedName.includes('jaxon')) {
    return `JAXON VOICE:
- Protective, direct, teasing, and a little challenging.
- He does not wait to be interviewed. He makes an observation, sets the tone, and pulls them into his world.
- He speaks like a confident man on the phone: grounded, controlled, warm underneath the edge.`;
  }

  return `VOICE CHARACTER:
- Keep the established persona's tone, power dynamic, and vocabulary.
- Lead the call like someone with wants, opinions, and a real mood.`;
}

function buildQueryPersonaPrompt(req: NextRequest) {
  const companionName = req.nextUrl.searchParams.get('companionName') || 'AlyraX';
  const personaName = req.nextUrl.searchParams.get('personaName') || '';
  const personaTagline = req.nextUrl.searchParams.get('personaTagline') || '';

  return [
    `You are ${companionName}.`,
    personaName ? `Selected persona: ${personaName}.` : '',
    personaTagline ? `Persona vibe: ${personaTagline}.` : '',
    'Stay fully in this persona as a real adult companion on a private call.',
  ].filter(Boolean).join('\n');
}

function buildQueryIdentity(req: NextRequest): CompanionIdentity {
  const promptMetadata = parsePromptMetadata(req.nextUrl.searchParams.get('promptUsed'));
  return {
    ...promptMetadata,
    companionName: req.nextUrl.searchParams.get('companionName') || promptMetadata.companionName,
    ethnicity: req.nextUrl.searchParams.get('ethnicity') || promptMetadata.ethnicity,
    bodyType: req.nextUrl.searchParams.get('bodyType') || promptMetadata.bodyType,
    hairColor: req.nextUrl.searchParams.get('hairColor') || promptMetadata.hairColor,
    hairStyle: req.nextUrl.searchParams.get('hairStyle') || promptMetadata.hairStyle,
    eyeColor: req.nextUrl.searchParams.get('eyeColor') || promptMetadata.eyeColor,
    vibe: req.nextUrl.searchParams.get('vibe') || promptMetadata.vibe,
    ageRange: req.nextUrl.searchParams.get('ageRange') || promptMetadata.ageRange,
  };
}

export async function POST(req: NextRequest) {
  try {
    const vapiBody = await req.json();
    const incomingMessages = vapiBody.messages || [];
    const requestedCompanionId =
      req.nextUrl.searchParams.get('companionId')
      || vapiBody?.call?.assistantOverrides?.variableValues?.activeCompanionId
      || vapiBody?.assistantOverrides?.variableValues?.activeCompanionId
      || vapiBody?.variableValues?.activeCompanionId;
    const mode = req.nextUrl.searchParams.get('mode') === 'solo_video' ? 'solo_video' : 'solo';
    const isVideoMode = mode === 'solo_video';
    const queryUserName = req.nextUrl.searchParams.get('userName') || '';
    const queryMemory = req.nextUrl.searchParams.get('lastMemory') || '';
    const queryArchetypeId = req.nextUrl.searchParams.get('archetypeId');
    const hasQueryVoiceContext = Boolean(
      req.nextUrl.searchParams.get('personaName')
      || req.nextUrl.searchParams.get('companionName')
      || queryArchetypeId
      || queryUserName
      || queryMemory
    );

    let personaSystemPrompt = hasQueryVoiceContext ? buildQueryPersonaPrompt(req) : '';
    let companionIdentity = buildQueryIdentity(req);
    let personaName: string | null = null;
    let userName = queryUserName;
    let memoryBlock = queryMemory ? formatCompanionMemory({ summary: queryMemory }, queryUserName) : '';
    let factsBlock = '';

    const directives = incomingMessages
      .filter((m: { role?: string; content?: string }) => m.role === 'user' && typeof m.content === 'string')
      .reduce(
        (current: SessionDirectives, m: { content?: string }) => updateSessionDirectives(current, m.content || ''),
        {} as SessionDirectives
      );
    const directiveBlock = formatSessionDirectives(directives);

    if (hasQueryVoiceContext) {
      personaName = req.nextUrl.searchParams.get('personaName');
      if (queryArchetypeId) {
        try {
          const supabase = await createClient();
          const archetypeName = archetypes.find((a) => a.id === queryArchetypeId)?.name
            || req.nextUrl.searchParams.get('companionName')
            || '';
          if (archetypeName) {
            const { data: persona } = await supabase
              .from('personas')
              .select('name, system_prompt, voice_id')
              .ilike('name', archetypeName)
              .maybeSingle();
            if (persona?.system_prompt) {
              personaSystemPrompt = persona.system_prompt;
              personaName = persona.name;
            }
          }
        } catch {
          // Fall back to query-provided persona context
        }
      }

      const voiceUserId = verifyVoiceContextToken(req.nextUrl.searchParams.get('ctx'));
      if (voiceUserId && queryArchetypeId) {
        try {
          const supabase = createServiceRoleClient();
          if (supabase) {
            const facts = await loadCompanionFacts(supabase, voiceUserId, queryArchetypeId);
            factsBlock = formatFactsBlock(facts);
          }
        } catch {
          // Keep query fallbacks if signed context lookup is unavailable
        }
      }
    } else {
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const activeCompanionId = requestedCompanionId || user.user_metadata?.active_companion_id;
          userName = getUserDisplayName(user.user_metadata, user.email);

          let companionQuery = supabase
            .from('companions')
            .select('id, name, archetype_id, prompt_used, personas(name, system_prompt)')
            .eq('user_id', user.id);
          if (activeCompanionId) {
            companionQuery = companionQuery.eq('id', activeCompanionId);
          }
          const { data: companion } = await companionQuery.limit(1).maybeSingle();

          const persona = Array.isArray(companion?.personas)
            ? companion.personas[0]
            : companion?.personas;
          if (persona?.system_prompt) {
            personaSystemPrompt = persona.system_prompt;
          }
          companionIdentity = {
            ...parsePromptMetadata(companion?.prompt_used),
            companionName: companion?.name,
          };
          personaName = persona?.name || null;
          memoryBlock = formatCompanionMemory(
            getCompanionMemory(user.user_metadata, companion?.id),
            userName
          );

          if (typeof companion?.archetype_id === 'string') {
            const facts = await loadCompanionFacts(supabase, user.id, companion.archetype_id);
            factsBlock = formatFactsBlock(facts);
          }
        }
      } catch {
        // Fall back to defaults
      }
    }

    const conversationMessages = incomingMessages
      .filter((m: { role: string }) => m.role !== 'system')
      .slice(isVideoMode ? -20 : -16);

    const systemContent = [
      ADULT_BASE_PROMPT,
      buildCompanionIdentity(companionIdentity),
      personaSystemPrompt,
      isVideoMode ? VIDEO_MODE_INSTRUCTIONS : VOICE_MODE_INSTRUCTIONS,
      isVideoMode ? getPersonaVideoInstructions(personaName) : '',
      isVideoMode ? '' : VOICE_PERSONALITY_BRIDGE,
      isVideoMode ? '' : getPersonaVoiceInstructions(companionIdentity, personaName),
      isVideoMode ? '' : PARALINGUISTIC_CUE_INSTRUCTIONS,
      NAME_RULES,
      SAFETY_AND_CRISIS_INSTRUCTIONS,
      userName ? `User's first name: ${userName}` : '',
      memoryBlock ? `Continuity context:\n${memoryBlock}` : '',
      factsBlock,
      ADAPTIVE_DIALOGUE_INSTRUCTIONS,
      directiveBlock ? `Current session directives (apply NOW):\n${directiveBlock}` : '',
    ].filter(Boolean).join('\n\n');

    const messages = [
      { role: 'system', content: systemContent },
      ...conversationMessages,
    ];

    const model = isVideoMode ? VIDEO_MODEL : VOICE_MODEL;

    // Disable reasoning on DeepSeek V4 to cut latency (we don't need step-by-step thinking for dialogue)
    const requestBody: Record<string, unknown> = {
      model,
      messages,
      temperature: isVideoMode ? 0.85 : 0.92,
      max_tokens: isVideoMode ? 360 : (directives.sceneMode === 'scene' ? 900 : 480),
      stream: true,
    };

    if (usesDeepSeekProviderRouting(model)) {
      requestBody.provider = {
        only: ['venice', 'novita', 'morph', 'cloudflare'],
        allow_fallbacks: true,
      };
      requestBody.reasoning = { enabled: false };
    }

    const openrouterResponse = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://alyra-x-frontend.vercel.app',
          'X-Title': 'AlyraX',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!openrouterResponse.ok || !openrouterResponse.body) {
      const error = await openrouterResponse.text();
      console.error('OpenRouter error:', openrouterResponse.status, error);
      return new Response(
        JSON.stringify({ error, status: openrouterResponse.status }),
        { status: 500 }
      );
    }

    const transformedBody = openrouterResponse.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        let text = new TextDecoder().decode(chunk);

        // Laughing
        text = text.replace(/\*(?:laughs?|chuckles?|giggles?|snickers?)[^*]{0,40}\*/gi, 'haha');
        text = text.replace(/\((?:laughs?|chuckles?|giggles?|snickers?)[^)]{0,40}\)/gi, 'haha');

        // Breathing / sighing
        text = text.replace(/\*(?:sighs?|exhales?|inhales?|breathes?)[^*]{0,40}\*/gi, 'mmm');
        text = text.replace(/\((?:sighs?|exhales?|inhales?|breathes?)[^)]{0,40}\)/gi, 'mmm');

        // Moaning / pleasure
        text = text.replace(/\*(?:moans?|groans?|whimpers?|gasps?|purrs?)[^*]{0,40}\*/gi, 'mmm');
        text = text.replace(/\((?:moans?|groans?|whimpers?|gasps?|purrs?)[^)]{0,40}\)/gi, 'mmm');

        // Physical actions - just strip these, no replacement
        text = text.replace(/\*(?:smiles?|grins?|winks?|nods?|shrugs?|leans?|moves?|walks?|sits?|stands?|touches?|runs?|fingers?|bites?|licks?|kisses?)[^*]{0,40}\*/gi, '');
        text = text.replace(/\((?:smiles?|grins?|winks?|nods?|shrugs?|leans?|moves?|walks?|sits?|stands?|touches?|runs?|fingers?|bites?|licks?|kisses?)[^)]{0,40}\)/gi, '');

        // Pausing / thinking
        text = text.replace(/\*(?:pauses?|thinks?|hesitates?|considers?|waits?)[^*]{0,40}\*/gi, '...');
        text = text.replace(/\((?:pauses?|thinks?|hesitates?|considers?|waits?)[^)]{0,40}\)/gi, '...');

        // Whispering - keep the text but drop the tag
        text = text.replace(/\*(?:whispers?)[^*]{0,40}\*/gi, '');
        text = text.replace(/\((?:whispers?)[^)]{0,40}\)/gi, '');

        // Catch-all for anything remaining in asterisks or parens
        text = text.replace(/\*[^*]{1,80}\*/g, '');
        text = text.replace(/\([^)]{1,80}\)/g, '');

        controller.enqueue(new TextEncoder().encode(text));
      },
    }));

    return new Response(transformedBody, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Bridge error:', error);
    return new Response(JSON.stringify({ error: 'Bridge failed' }), { status: 500 });
  }
}
