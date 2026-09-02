'use strict';

const fs = require('node:fs');
const path = require('node:path');

const API_ROOT = 'https://v3.football.api-sports.io';
const FOTMOB_ROOT = 'https://www.fotmob.com/api/data/matches';
const REQUEST_TIMEOUT_MS = 12000;
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'canli-skorlar.json');
const TIMEZONE = 'Europe/Istanbul';
const TRACKED_LEAGUES = [
  203, // Super Lig
  2,   // UEFA Champions League
  3,   // UEFA Europa League
  848, // UEFA Conference League
  39,  // Premier League
  140, // La Liga
  135, // Serie A
  78,  // Bundesliga
  61,  // Ligue 1
  88   // Eredivisie
];
const FOTMOB_LEAGUE_IDS = new Map([
  ['TUR|super lig', 203],
  ['INT|champions league', 2],
  ['INT|europa league', 3],
  ['INT|conference league', 848],
  ['INT|europa conference league', 848],
  ['ENG|premier league', 39],
  ['ESP|laliga', 140],
  ['ESP|la liga', 140],
  ['ITA|serie a', 135],
  ['GER|bundesliga', 78],
  ['FRA|ligue 1', 61],
  ['NED|eredivisie', 88]
]);
const TRACKED_SET = new Set(TRACKED_LEAGUES);
const LEAGUE_PRIORITY = new Map(TRACKED_LEAGUES.map((id, index) => [id, index]));
const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE']);
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
const UPCOMING_STATUSES = new Set(['NS', 'TBD']);

function istanbulDateString(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );
  return values.year + '-' + values.month + '-' + values.day;
}

function matchKind(status) {
  const value = String(status || '').toUpperCase();
  if (LIVE_STATUSES.has(value)) return 'live';
  if (FINISHED_STATUSES.has(value)) return 'finished';
  if (UPCOMING_STATUSES.has(value)) return 'upcoming';
  return 'other';
}

function apiErrors(body) {
  const errors = body && body.errors;
  if (!errors) return [];
  if (Array.isArray(errors)) return errors.filter(Boolean).map(String);
  if (typeof errors === 'object') return Object.values(errors).flat().filter(Boolean).map(String);
  return [String(errors)];
}

function normalizeFixtures(body) {
  const fixtures = Array.isArray(body && body.response) ? body.response : [];

  return fixtures
    .filter((fixture) => TRACKED_SET.has(Number(fixture.league && fixture.league.id)))
    .map((fixture) => {
      const leagueId = Number(fixture.league.id);
      const date = String(fixture.fixture && fixture.fixture.date || '');
      const status = String(fixture.fixture && fixture.fixture.status && fixture.fixture.status.short || '');
      return {
        id: Number(fixture.fixture && fixture.fixture.id),
        leagueId,
        league: String(fixture.league && fixture.league.name || ''),
        country: String(fixture.league && fixture.league.country || ''),
        round: String(fixture.league && fixture.league.round || ''),
        date,
        timestamp: Number(fixture.fixture && fixture.fixture.timestamp || 0),
        venue: String(fixture.fixture && fixture.fixture.venue && fixture.fixture.venue.name || ''),
        home: String(fixture.teams && fixture.teams.home && fixture.teams.home.name || ''),
        away: String(fixture.teams && fixture.teams.away && fixture.teams.away.name || ''),
        homeScore: fixture.goals && fixture.goals.home != null ? Number(fixture.goals.home) : null,
        awayScore: fixture.goals && fixture.goals.away != null ? Number(fixture.goals.away) : null,
        minute: fixture.fixture && fixture.fixture.status && fixture.fixture.status.elapsed != null
          ? Number(fixture.fixture.status.elapsed)
          : null,
        status,
        statusLong: String(fixture.fixture && fixture.fixture.status && fixture.fixture.status.long || ''),
        kind: matchKind(status)
      };
    })
    .filter((match) => match.id && match.date && match.home && match.away)
    .sort((left, right) => {
      const leagueDifference =
        (LEAGUE_PRIORITY.get(left.leagueId) ?? 99) - (LEAGUE_PRIORITY.get(right.leagueId) ?? 99);
      return leagueDifference || left.timestamp - right.timestamp || left.id - right.id;
    });
}

function normalizeFotmobMatches(body) {
  const leagues = Array.isArray(body?.leagues) ? body.leagues : [];
  const matches = [];
  for (const league of leagues) {
    const key = String(league?.ccode || '') + '|' +
      String(league?.name || '').toLocaleLowerCase('en-US');
    const leagueId = FOTMOB_LEAGUE_IDS.get(key);
    if (!leagueId) continue;
    for (const fixture of Array.isArray(league?.matches) ? league.matches : []) {
      const date = String(fixture?.status?.utcTime || '');
      const status = fixture?.status?.cancelled ? 'PST'
        : fixture?.status?.finished ? 'FT'
          : fixture?.status?.started ? 'LIVE' : 'NS';
      matches.push({
        id: Number(fixture?.id || 0),
        leagueId,
        league: String(league?.name || ''),
        country: String(league?.ccode || ''),
        round: String(fixture?.tournamentStage || ''),
        date,
        timestamp: Math.floor(new Date(date || 0).getTime() / 1000),
        venue: '',
        home: String(fixture?.home?.longName || fixture?.home?.name || ''),
        away: String(fixture?.away?.longName || fixture?.away?.name || ''),
        homeScore: fixture?.home?.score == null ? null : Number(fixture.home.score),
        awayScore: fixture?.away?.score == null ? null : Number(fixture.away.score),
        minute: fixture?.status?.liveTime?.short == null
          ? null : Number.parseInt(fixture.status.liveTime.short, 10) || null,
        status,
        statusLong: String(fixture?.status?.reason?.long || ''),
        kind: matchKind(status)
      });
    }
  }
  return matches
    .filter((match) => match.id && match.date && match.home && match.away)
    .sort((left, right) => {
      const priority = (LEAGUE_PRIORITY.get(left.leagueId) ?? 99) -
        (LEAGUE_PRIORITY.get(right.leagueId) ?? 99);
      return priority || left.timestamp - right.timestamp || left.id - right.id;
    });
}

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
function summaryFor(matches) {
  return matches.reduce((summary, match) => {
    summary.total += 1;
    if (match.kind === 'live') summary.live += 1;
    if (match.kind === 'upcoming') summary.upcoming += 1;
    if (match.kind === 'finished') summary.finished += 1;
    return summary;
  }, { total: 0, live: 0, upcoming: 0, finished: 0 });
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
