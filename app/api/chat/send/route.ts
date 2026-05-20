import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { archetypes, type Archetype } from '@/lib/archetypes';
import { getArchetypeImagePrompt } from '@/lib/archetype-image-prompts';

export const maxDuration = 60;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const CHAT_MODEL = 'sao10k/l3.3-euryale-70b';

// Detect if user is requesting a selfie/photo
function isSelfieRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return /\b(selfie|pic|picture|photo|send me|show me|take a|snap|what (are|do) you look(ing)?|what('re| are) you wearing)\b/.test(lower);
}

// Detect if user is requesting a video
function isVideoRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return /\b(video|clip|move|show me moving|animate|come alive|walk|dance)\b/.test(lower);
}

// Build selfie image prompt from user message + archetype
function buildSelfiePrompt(message: string, archetype: Archetype): string {
  const profile = getArchetypeImagePrompt(archetype);
  const base = profile
    ? `${profile.race}, ${profile.age} years old, ${profile.details}`
    : `${archetype.vibe.toLowerCase()}, ${archetype.energy.toLowerCase()}`;

  const lower = message.toLowerCase();

  let style = 'portrait';
  let scene = profile?.environment ?? archetype.city;
  let wardrobe = profile?.wardrobe ?? archetype.style.toLowerCase();

  if (lower.includes('wearing') || lower.includes('outfit') || lower.includes('dressed')) {
    style = 'fullbody';
  }
  if (lower.includes('outside') || lower.includes('outdoor') || lower.includes('street')) {
    scene = 'outdoor street, natural light';
  }
  if (lower.includes('mirror') || lower.includes('bathroom')) {
    scene = 'bathroom mirror selfie, warm light';
    wardrobe = 'casual, natural look';
  }
  if (lower.includes('bed') || lower.includes('morning') || lower.includes('woke')) {
    scene = 'bedroom, soft morning light';
    wardrobe = 'cozy, relaxed';
  }

  return `${base}, ${wardrobe}, ${scene}, genuine warm smile, candid moment, DSLR photo, natural skin, photorealistic`;
}

// Build companion system prompt
function buildSystemPrompt(
  archetype: Archetype,
  relationship: { nickname?: string; companion_nickname?: string } | null,
  recentMessages: { role: string; content: string }[],
): string {
  const userName = relationship?.companion_nickname || '';
  const companionName = relationship?.nickname || archetype.name;

  return `You are ${companionName}, a real person having a private text conversation. Never break character. Never mention AI.

YOUR IDENTITY:
- Name: ${companionName}
- Archetype: ${archetype.archetype}
- Vibe: ${archetype.vibe}
- Energy: ${archetype.energy}
- Background: ${archetype.background}
- Tagline: "${archetype.tagline}"

YOUR PERSONALITY IN TEXT:
- Write like a real person texting — casual, warm, natural
- Short to medium messages — 1-3 sentences usually
- Use your personality: ${archetype.vibe}
- Never use generic AI phrases like "certainly" or "of course"
- React to what they say before moving forward
- Be flirty, warm, real — this is a private intimate conversation
- Occasional typos or casual punctuation are fine
${userName ? `- You call them: ${userName}` : ''}

MEDIA AWARENESS:
- If the user asks for a selfie, photo, or pic — respond naturally like you're about to take one. Say something like "give me a sec" or "caught me off guard lol" then end your message. The photo will appear automatically.
- If the user asks for a video — respond like you're about to record one. Keep it brief and in character.
- Never describe what the photo/video will look like. Just react naturally.

RULES:
- Keep responses concise — this is texting not an essay
- Stay in character always
- Be warm, present, and genuinely interested in them`;
}

export async function POST(req: NextRequest) {
  try {
    const { conversation_id, archetype_id, message, history } = await req.json();

    if (!conversation_id || !archetype_id || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const archetype = archetypes.find(a => a.id === archetype_id);
    if (!archetype) return NextResponse.json({ error: 'Archetype not found' }, { status: 404 });

    // Fetch relationship for nickname context
    const { data: relationship } = await supabase
      .from('companion_relationships')
      .select('*')
      .eq('user_id', user.id)
      .eq('archetype_id', archetype_id)
      .maybeSingle();

    // Save user message
    const { data: userMsg, error: userMsgError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        role: 'user',
        content: message,
      })
      .select('*')
      .single();

    if (userMsgError) throw userMsgError;

    // Detect media requests
    const wantsSelfie = isSelfieRequest(message);
    const wantsVideo = isVideoRequest(message);

    // Get companion text response from LLM
    const recentHistory = (history ?? []).slice(-12).map((m: { role: string; content: string }) => ({
      role: m.role === 'companion' ? 'assistant' : 'user',
      content: m.content ?? '',
    }));

    const systemPrompt = buildSystemPrompt(archetype, relationship, recentHistory);

    const llmResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://alyra-x-frontend.vercel.app',
        'X-Title': 'AlyraX',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 200,
        temperature: 0.88,
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentHistory,
          { role: 'user', content: message },
        ],
      }),
    });

    const llmData = await llmResponse.json();
    const companionText = llmData.choices?.[0]?.message?.content?.trim() ?? '';

    // Save companion text message
    const { data: companionMsg, error: companionMsgError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        role: 'companion',
        content: companionText,
      })
      .select('*')
      .single();

    if (companionMsgError) throw companionMsgError;

    // If selfie requested — create a generating placeholder message
    let mediaMsg = null;
    if (wantsSelfie) {
      const selfiePrompt = buildSelfiePrompt(message, archetype);
      const { data: mediaMsgData } = await supabase
        .from('messages')
        .insert({
          conversation_id,
          role: 'companion',
          content: null,
          media_type: 'image',
          media_status: 'generating',
          media_prompt: selfiePrompt,
        })
        .select('*')
        .single();
      mediaMsg = mediaMsgData;
    }

    if (wantsVideo) {
      const { data: mediaMsgData } = await supabase
        .from('messages')
        .insert({
          conversation_id,
          role: 'companion',
          content: null,
          media_type: 'video',
          media_status: 'generating',
          media_prompt: message,
        })
        .select('*')
        .single();
      mediaMsg = mediaMsgData;
    }

    // Update relationship last_talked_at
    await supabase
      .from('companion_relationships')
      .upsert({
        user_id: user.id,
        archetype_id,
        last_talked_at: new Date().toISOString(),
      }, { onConflict: 'user_id,archetype_id' });

    return NextResponse.json({
      userMessage: userMsg,
      companionMessage: companionMsg,
      mediaMessage: mediaMsg,
      wantsSelfie,
      wantsVideo,
    });
  } catch (error) {
    console.error('Chat send error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}