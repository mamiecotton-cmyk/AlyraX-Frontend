type UserMetadata = Record<string, unknown>;

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function getUserGenderContext(metadata?: UserMetadata | null) {
  const rawGender = firstString(
    metadata?.alyrax_user_gender,
    metadata?.user_gender,
    metadata?.avatar_gender,
    metadata?.gender,
    metadata?.gender_identity,
  );
  const rawPronouns = firstString(metadata?.pronouns, metadata?.user_pronouns);
  const normalized = `${rawGender} ${rawPronouns}`.toLowerCase();

  let genderLabel = '';
  let pronounLabel = rawPronouns;
  if (/\b(nonbinary|non-binary|enby|they\/them)\b/.test(normalized)) {
    genderLabel = 'nonbinary person';
    pronounLabel ||= 'they/them';
  } else if (/\b(woman|female|girl|she\/her)\b/.test(normalized)) {
    genderLabel = 'woman';
    pronounLabel ||= 'she/her';
  } else if (/\b(man|male|guy|boy|he\/him)\b/.test(normalized)) {
    genderLabel = 'man';
    pronounLabel ||= 'he/him';
  } else if (rawGender) {
    genderLabel = rawGender;
  }

  if (!genderLabel && !pronounLabel) return '';

  return [
    genderLabel ? `User gender/presentation: ${genderLabel}` : '',
    pronounLabel ? `User pronouns: ${pronounLabel}` : '',
    'Use this context for terms of address, compliments, attraction, pronouns, and roleplay language. Do not misgender the user. If anything is unclear, keep language gender-neutral.',
  ].filter(Boolean).join('\n');
}
