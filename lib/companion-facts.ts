type FactsClient = {
  from: (table: string) => unknown;
};

type FactsTable = {
  select: (columns: string) => FactsFilter;
  insert: (values: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
  };
};

type FactsFilter = {
  eq: (column: string, value: string) => FactsFilter;
  limit: (count: number) => {
    maybeSingle: () => Promise<{ data: { id?: string; facts?: unknown } | null; error: { message?: string } | null }>;
  };
};

export function normalizeFacts(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((fact): fact is string => typeof fact === 'string')
    .map((fact) => fact.replace(/\s+/g, ' ').trim())
    .filter((fact) => fact.length >= 4 && fact.length <= 180);
}

export function mergeFacts(existing: string[], incoming: string[], maxFacts = 40) {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const fact of [...incoming, ...existing]) {
    const normalized = fact.replace(/\s+/g, ' ').trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
    if (merged.length >= maxFacts) break;
  }

  return merged;
}

export function formatFactsBlock(facts: string[], maxFacts = 16) {
  const picked = facts.slice(0, maxFacts);
  return picked.length
    ? `WHAT YOU KNOW ABOUT THIS PERSON:\n${picked.map((fact) => `- ${fact}`).join('\n')}`
    : '';
}

export function formatFactsSummary(facts: string[], maxChars = 500) {
  const summary = facts
    .slice(0, 12)
    .map((fact) => `- ${fact}`)
    .join('\n');

  return summary.length > maxChars ? `${summary.slice(0, maxChars - 1)}...` : summary;
}

export async function loadCompanionFacts(
  supabase: FactsClient,
  userId: string,
  archetypeId: string,
) {
  const factsTable = supabase.from('companion_facts') as FactsTable;
  const { data, error } = await factsTable
    .select('id, facts')
    .eq('user_id', userId)
    .eq('archetype_id', archetypeId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Companion facts load error:', error.message || error);
    return [];
  }

  return normalizeFacts(data?.facts);
}

export async function mergeCompanionFacts(
  supabase: FactsClient,
  userId: string,
  archetypeId: string,
  incomingFacts: string[],
) {
  const cleanIncoming = normalizeFacts(incomingFacts);
  if (!cleanIncoming.length) return;

  const factsTable = supabase.from('companion_facts') as FactsTable;
  const { data, error } = await factsTable
    .select('id, facts')
    .eq('user_id', userId)
    .eq('archetype_id', archetypeId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Companion facts fetch before merge error:', error.message || error);
    return;
  }

  const facts = mergeFacts(normalizeFacts(data?.facts), cleanIncoming);

  if (data?.id) {
    const { error: updateError } = await factsTable
      .update({ facts, updated_at: new Date().toISOString() })
      .eq('id', data.id);

    if (updateError) console.error('Companion facts update error:', updateError.message || updateError);
    return;
  }

  const { error: insertError } = await factsTable
    .insert({
      user_id: userId,
      archetype_id: archetypeId,
      facts,
      updated_at: new Date().toISOString(),
    });

  if (insertError) console.error('Companion facts insert error:', insertError.message || insertError);
}
