import { archetypes, type Archetype } from './archetypes';

export type PersonalityVector = [number, number, number, number, number];

export type MatchResult = {
  archetype: Archetype;
  score: number; // 0–1, higher = closer match
  rank: number;
};

/**
 * Cosine similarity between two equal-length vectors.
 * Returns 0–1 (1 = identical direction).
 */
function cosineSimilarity(a: PersonalityVector, b: PersonalityVector): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Match a user's personality vector against all archetypes.
 * Returns all 20 archetypes ranked by similarity, highest first.
 *
 * @param userVector  5-dim vector from Pulse Quiz answers
 * @param gender      Optional filter: 'M' | 'F' | undefined (both)
 */
export function matchArchetypes(
  userVector: PersonalityVector,
  gender?: 'M' | 'F',
): MatchResult[] {
  const pool = gender
    ? archetypes.filter((a) => a.gender === gender)
    : archetypes;

  const scored = pool.map((archetype) => ({
    archetype,
    score: cosineSimilarity(userVector, archetype.vector),
    rank: 0,
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Get the single best match for a user vector.
 */
export function getBestMatch(
  userVector: PersonalityVector,
  gender?: 'M' | 'F',
): MatchResult {
  return matchArchetypes(userVector, gender)[0];
}

/**
 * Pulse Quiz — convert 5 question answers (0–4 scale) to a personality vector.
 * Each answer maps to a dimension (0.0–1.0).
 *
 * Q1 → intensity    (0=very calm, 4=very intense)
 * Q2 → warmth       (0=independent/cool, 4=deeply nurturing)
 * Q3 → intellect    (0=gut instinct, 4=analytical)
 * Q4 → street       (0=polished, 4=raw/street)
 * Q5 → dominance    (0=soft/yielding, 4=dominant/commanding)
 */
export function quizAnswersToVector(
  answers: [number, number, number, number, number],
): PersonalityVector {
  return answers.map((a) => Math.min(1, Math.max(0, a / 4))) as PersonalityVector;
}

/**
 * Euclidean distance — alternative scoring, lower = closer.
 * Exposed as utility for potential future use.
 */
export function euclideanDistance(
  a: PersonalityVector,
  b: PersonalityVector,
): number {
  return Math.sqrt(
    a.reduce((sum, ai, i) => sum + (ai - b[i]) ** 2, 0),
  );
}