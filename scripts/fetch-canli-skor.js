'use strict';

const fs = require('node:fs');
const path = require('node:path');

const API_ROOT = 'https://v3.football.api-sports.io';
const FOTMOB_ROOT = 'https://www.fotmob.com/api/data/matches';
const REQUEST_TIMEOUT_MS = 12000;
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'canli-skorlar.json');
const {TIMEZONE,TRACKED_LEAGUES,apiErrors,istanbulDateString,matchKind,normalizeFixtures,normalizeFotmobMatches,summaryFor}=require('./score-normalization');

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(url, options, label, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) {
        throw new Error(label + ' request failed: HTTP ' + response.status);
      }
      lastError = new Error(label + ' temporary failure: HTTP ' + response.status);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await wait(500 * (2 ** (attempt - 1)));
  }
  throw lastError;
}
async function fetchFixtures(date, key) {
  const query = new URLSearchParams({ date, timezone: TIMEZONE });
  const response = await fetchWithRetry(API_ROOT + '/fixtures?' + query, {
    headers: { 'x-apisports-key': key }
  }, 'API-Football');
  const body = await response.json();
  const errors = apiErrors(body);
  if (errors.length) {
    throw new Error('API-Football error: ' + errors.join(' | '));
  }
  return body;
}
async function fetchFotmob(date) {
  const query = new URLSearchParams({
    date: date.replaceAll('-', ''),
    ccode3: 'TUR',
    timezone: TIMEZONE
  });
  const response = await fetchWithRetry(FOTMOB_ROOT + '?' + query, {
    headers: { accept: 'application/json', 'user-agent': 'GOLHAT/1.0 (+https://golhat.com)' }
  }, 'FotMob');
  return response.json();
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}

async function main() {
  const key = process.env.API_FOOTBALL_KEY;
  const preferFotmob = process.env.PREFER_FOTMOB === 'true';
  const date = istanbulDateString();
  let matches;
  let provider;
  let sourceUrl;
  let degraded = false;
  if (key && !preferFotmob) {
    try {
      matches = normalizeFixtures(await fetchFixtures(date, key));
      provider = 'API-Football';
      sourceUrl = 'https://www.api-football.com/';
    } catch (error) {
      degraded = true;
      console.warn('Primary provider unavailable, using fallback:', error.message);
    }
  } else {
    degraded = true;
    if (!key) {
      console.warn('API_FOOTBALL_KEY missing, using fallback provider.');
    } else {
      console.warn('Overnight quota guard enabled, using fallback provider.');
    }
  }
  if (!matches) {
    matches = normalizeFotmobMatches(await fetchFotmob(date));
    provider = 'FotMob';
    sourceUrl = 'https://www.fotmob.com/';
  }
  const output = {
    updatedAt: new Date().toISOString(), source: provider, sourceUrl,
    providerChain: ['API-Football', 'FotMob'], degraded, date,
    timezone: TIMEZONE, trackedLeagues: TRACKED_LEAGUES,
    summary: summaryFor(matches), matches
  };
  writeJsonAtomic(OUTPUT_PATH, output);
  console.log(
    'Match center written via ' + provider + ': ' + matches.length + ' matches, ' +
    output.summary.live + ' live, ' + output.summary.upcoming + ' upcoming.'
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  TRACKED_LEAGUES,
  apiErrors,
  istanbulDateString,
  matchKind,
  normalizeFotmobMatches,
  normalizeFixtures,
  summaryFor
};
