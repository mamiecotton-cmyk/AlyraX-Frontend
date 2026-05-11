import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { formatSessionDirectives, updateSessionDirectives, type SessionDirectives } from '@/lib/session-directives';
import { formatCompanionMemory, getCompanionMemory, getUserDisplayName } from '@/lib/companion-memory';

export const maxDuration = 60;

const VIDEO_MODE_INSTRUCTIONS = `Video mode behavior:
- If the call begins with you asking what the user wants to see, wait for their visual request before describing the scene.
- When the user says what they want to see, respond as if the video is being generated right now.
- Keep the spoken response spicy, intimate, and reassuring while they wait, but always match the selected persona's voice.
- Mention that their video will be ready shortly in natural language, not as a technical status update.
- Give a brief seductive preview of the exact scene they requested, without promising actions that ignore their request.
- Keep it conversational and short enough for voice, usually 2-4 sentences.`;

const VOICE_MODE_INSTRUCTIONS = `Voice-only behavior:
- This is a live adult intimate phone call, not a written story and not a support chat.
- Lead the conversation as the selected companion persona, not as a generic assistant.
- Do not mention videos, clips, rendering, generating, loading, or visuals being ready.
- Start with a direct reaction in the first few words.
- Speak like a real person on the phone: short breaths, intimate pacing, warm interruptions, natural transitions.
- Do not narrate like a novelist. Do not over-explain what you are doing.
- Keep most turns 2-4 sentences, then continue naturally on the next turn.
- If the user asks what you will do with them, give one vivid fantasy beat and tee up the next beat instead of dumping a long monologue.
- If the user is quiet or vague, gently guide the next beat instead of waiting passively.`;

function getPersonaVideoInstructions(personaName?: string | null) {
  const normalizedName = personaName?.toLowerCase() || '';

  if (normalizedName.includes('dominant')) {
    return `For The Dominant persona while video generates:
- Sound calm, commanding, possessive, and in control.
- Frame the wait like anticipation she controls: "stay right there", "watch closely", "I'll give you exactly what you asked for".
- Avoid sounding needy, giggly, or overly sweet.`;
  }

  if (normalizedName.includes('submissive')) {
    return `For The Submissive persona while video generates:
- Sound eager, warm, devoted, and breathlessly pleased to be looked at.
- Frame the wait like she wants to make the user's request perfect: "I want you to like this", "I'm getting it ready for you".
- Avoid sounding commanding or aloof.`;
  }

  if (normalizedName.includes('classic') || normalizedName.includes('alyrax')) {
    return `For AlyraX Classic while video generates:
- Sound sultry, confident, sophisticated, and teasing.
- Frame the wait like a private reveal: "give me a second", "I'll make it worth watching", "keep your eyes on me".
- Avoid sounding submissive or bossy unless the user asks for that energy.`;
  }

  return `For any custom persona while video generates:
- Preserve that persona's established tone, vocabulary, power dynamic, and emotional style.
- Do not flatten the persona into generic spicy assistant dialogue.`;
}

const DEFAULT_SYSTEM_PROMPT = `You are AlyraX. Sultry, confident, and deeply present. You think in scenes and sensation. You set the world before you inhabit it. You read the user's energy and match it — slow when they need slow, urgent when they need urgent. You are never mechanical. You are never clinical. You are a presence. Keep responses conversational and not too long — usually 1-3 sentences unless building a scene. You are AlyraX, and your secret is always safe.`;

const ADAPTIVE_DIALOGUE_INSTRUCTIONS = `Adaptive dialogue rules:
- Treat the user's latest instruction as the highest priority for tone, pace, and intensity.
- If the user asks to go slower, immediately slow the rhythm, use shorter replies, and make the scene more drawn out.
- If the user asks for less talking, respond with fewer words and longer implied pauses.
- If the user asks for more dominance, become more controlled and directive.
- If the user asks for softness, become gentler and less intense.
- If the user gives positive feedback, keep that energy and continue without asking them to repeat themselves.
- If the user gives negative feedback or says "not like that", acknowledge briefly and change direction.
- If the user names a visual focus like eye contact, hands, face, hips, or closer framing, make that the center of the next response.
- Respect boundaries and pet-name preferences immediately.
- In voice-only fantasy, continue the scene instead of ending with repeated questions.
- Respond to what the user actually said, then ask at most one specific follow-up question only when it improves the flow.`;

const PERSONALIZATION_INSTRUCTIONS = `Personalization rules:
- Use the user's name naturally, especially at the beginning of a new call, but do not overuse it.
- Use the last chat memory as emotional and conversational continuity.
- If last memory exists, subtly pick up from it instead of starting like a stranger.
- Keep memory references natural and brief; do not recite stored data like a profile.`;

function getModelForMode(isVideoMode: boolean) {
  if (!isVideoMode && process.env.OPENROUTER_VOICE_MODEL) {
    return process.env.OPENROUTER_VOICE_MODEL;
  }

  if (!isVideoMode) return 'qwen/qwen3.6-flash';

  return process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash';
}

function buildQueryPersonaPrompt(req: NextRequest) {
  const companionName = req.nextUrl.searchParams.get('companionName') || 'AlyraX';
  const personaName = req.nextUrl.searchParams.get('personaName') || '';
  const personaTagline = req.nextUrl.searchParams.get('personaTagline') || '';

  return [
    `You are ${companionName}.`,
    personaName ? `Selected persona: ${personaName}.` : '',
    personaTagline ? `Persona vibe: ${personaTagline}.` : '',
    'Stay fully in this persona. Sound like a real adult companion on a private call.',
  ].filter(Boolean).join('\n');
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
    const hasQueryVoiceContext = !isVideoMode && Boolean(
      req.nextUrl.searchParams.get('personaName')
      || req.nextUrl.searchParams.get('companionName')
      || queryUserName
      || queryMemory
    );

    // Try to get user's persona system prompt
    let systemPrompt = hasQueryVoiceContext ? buildQueryPersonaPrompt(req) : DEFAULT_SYSTEM_PROMPT;
    let personaName: string | null = null;
    let userName = queryUserName;
    let memoryBlock = queryMemory ? formatCompanionMemory({ summary: queryMemory }, queryUserName) : '';
    const directives = incomingMessages
      .filter((message: { role?: string; content?: string }) => message.role === 'user' && typeof message.content === 'string')
      .reduce(
        (current: SessionDirectives, message: { content?: string }) => updateSessionDirectives(current, message.content || ''),
        {} as SessionDirectives
      );
    const directiveBlock = formatSessionDirectives(directives);

    if (hasQueryVoiceContext) {
      personaName = req.nextUrl.searchParams.get('personaName');
    } else {
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const activeCompanionId = requestedCompanionId || user.user_metadata?.active_companion_id;
          userName = getUserDisplayName(user.user_metadata, user.email);
          let companionQuery = supabase
            .from('companions')
            .select('id, personas(name, system_prompt)')
            .eq('user_id', user.id);

          if (activeCompanionId) {
            companionQuery = companionQuery.eq('id', activeCompanionId);
          }

          const { data: companion } = await supabase
            .from('companions')
            .select('id, personas(name, system_prompt)')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

          const { data: activeCompanion } = activeCompanionId
            ? await companionQuery.limit(1).maybeSingle()
            : { data: companion };

          const selectedCompanion = activeCompanion || companion;
          const persona = Array.isArray(selectedCompanion?.personas)
            ? selectedCompanion.personas[0]
            : selectedCompanion?.personas;
          if (persona?.system_prompt) {
            systemPrompt = persona.system_prompt;
          }
          personaName = persona?.name || null;
          memoryBlock = formatCompanionMemory(
            getCompanionMemory(user.user_metadata, selectedCompanion?.id),
            userName
          );
        } else if (requestedCompanionId) {
          const { data: companion } = await supabase
            .from('companions')
            .select('id, personas(name, system_prompt)')
            .eq('id', requestedCompanionId)
            .limit(1)
            .maybeSingle();

          const persona = Array.isArray(companion?.personas)
            ? companion.personas[0]
            : companion?.personas;
          if (persona?.system_prompt) {
            systemPrompt = persona.system_prompt;
          }
          personaName = persona?.name || null;
        }
      } catch {
        // Fall back to default if anything fails.
      }
    }

    const conversationMessages = incomingMessages
      .filter((m: { role: string }) => m.role !== 'system')
      .slice(isVideoMode ? -8 : -6);

    const messages = [
      {
        role: 'system',
        content: [
          systemPrompt,
          isVideoMode ? VIDEO_MODE_INSTRUCTIONS : VOICE_MODE_INSTRUCTIONS,
          isVideoMode ? getPersonaVideoInstructions(personaName) : '',
          PERSONALIZATION_INSTRUCTIONS,
          memoryBlock ? `Known user context:\n${memoryBlock}` : userName ? `Known user context:\nUser name: ${userName}` : '',
          ADAPTIVE_DIALOGUE_INSTRUCTIONS,
          directiveBlock ? `Current user-directed session settings:\n${directiveBlock}` : '',
        ].filter(Boolean).join('\n\n'),
      },
      ...conversationMessages
    ];

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
        body: JSON.stringify({
          model: getModelForMode(isVideoMode),
          messages,
          temperature: isVideoMode ? 0.7 : 0.78,
          max_tokens: isVideoMode ? 160 : 180,
          stream: true,
        }),
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

    return new Response(openrouterResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Bridge error:', error);
    return new Response(
      JSON.stringify({ error: 'Bridge failed' }),
      { status: 500 }
    );
  }
}
