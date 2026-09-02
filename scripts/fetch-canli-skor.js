'use strict';

const fs = require('node:fs');
const path = require('node:path');

const API_ROOT = 'https://v3.football.api-sports.io';
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
  61   // Ligue 1
];
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
  const response = await fetch(API_ROOT + '/fixtures?' + query, {
    headers: { 'x-apisports-key': key }
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error('API-Football request failed: HTTP ' + response.status);
  }
  const errors = apiErrors(body);
  if (errors.length) {
    throw new Error('API-Football error: ' + errors.join(' | '));
  }
  return body;
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}

async function main() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY is missing.');

  const date = istanbulDateString();
  const body = await fetchFixtures(date, key);
  const matches = normalizeFixtures(body);
  const output = {
    updatedAt: new Date().toISOString(),
    source: 'API-Football',
    sourceUrl: 'https://www.api-football.com/',
    date,
    timezone: TIMEZONE,
    trackedLeagues: TRACKED_LEAGUES,
    summary: summaryFor(matches),
    matches
  };

  writeJsonAtomic(OUTPUT_PATH, output);
  console.log(
    'Match center written: ' + matches.length + ' matches, ' +
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
  normalizeFixtures,
  summaryFor
};
