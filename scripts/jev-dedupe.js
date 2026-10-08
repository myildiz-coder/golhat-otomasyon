'use strict';

// TypeSafe Jev "same story" check. It can only make dedupe stricter: it skips a candidate,
// it never lets through a story the token check already rejected. Without TYPESAFE_API_KEY it is off.
const { headlineSimilarity } = require('./editorial-lib');

const JEV_DUPLICATE_MIN = 0.8;
const JEV_SHORTLIST_MIN_SIMILARITY = 0.25;
const JEV_SHORTLIST_SIZE = 6;

function shortlist(headline, known) {
  return [...new Set(known)]
    .map((other) => ({ other, similarity: headlineSimilarity(headline, other) }))
    .filter((item) => item.similarity >= JEV_SHORTLIST_MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, JEV_SHORTLIST_SIZE)
    .map((item) => item.other);
}

async function jevDuplicateOf(headline, summary, known, env = process.env) {
  const key = env.TYPESAFE_API_KEY;
  const candidates = shortlist(headline, known);
  if (!key || candidates.length === 0) return null;
  const questions = {};
  candidates.forEach((_, i) => {
    questions['c' + i] = {
      type: 'noul',
      instructions: 'Do `new_story` and `existing[' + i + ']` (Turkish football headlines) report the same event or make the same point, so that a reader who saw `existing[' + i + ']` learns no new development from `new_story`?',
    };
  });
  const response = await fetch((env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai') + '/v1/systemone', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.TYPESAFE_MODEL || 'jev-1.13.0', state: { new_story: { headline, summary }, existing: candidates }, questions }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Jev HTTP ' + response.status);
  const { answers } = await response.json();
  let best = null;
  candidates.forEach((other, i) => {
    const p = answers['c' + i] && answers['c' + i].noul;
    if (p >= JEV_DUPLICATE_MIN && (!best || p > best.p)) best = { other, p };
  });
  return best;
}

module.exports = { jevDuplicateOf, JEV_DUPLICATE_MIN };
