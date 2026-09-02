'use strict';

const fs = require('node:fs');
const path = require('node:path');

const API_ROOT = 'https://v3.football.api-sports.io';
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'avrupa-ligleri.json');
const TIMEZONE = 'Europe/Istanbul';
const UPCOMING_STATUSES = new Set(['NS', 'TBD', 'PST']);
const LEAGUES = [
  { key: 'england', id: 39, country: 'İngiltere', name: 'Premier League' },
  { key: 'spain', id: 140, country: 'İspanya', name: 'La Liga' },
  { key: 'italy', id: 135, country: 'İtalya', name: 'Serie A' },
  { key: 'france', id: 61, country: 'Fransa', name: 'Ligue 1' },
  { key: 'germany', id: 78, country: 'Almanya', name: 'Bundesliga' },
  { key: 'netherlands', id: 88, country: 'Hollanda', name: 'Eredivisie' }
];

function istanbulDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
}

function seasonFor(value = new Date()) {
  const parts = istanbulDateParts(value);
  return parts.month >= 7 ? parts.year : parts.year - 1;
}

function apiErrors(body) {
  const errors = body && body.errors;
  if (!errors) return [];
  if (Array.isArray(errors)) return errors.filter(Boolean).map(String);
  if (typeof errors === 'object') {
    return Object.values(errors).flat().filter(Boolean).map(String);
  }
  return [String(errors)];
}

function normalizeStandings(body) {
  const groups = body?.response?.[0]?.league?.standings;
  if (!Array.isArray(groups) || !groups.length) {
    throw new Error('Puan cetveli API yanıtında bulunamadı.');
  }
  const rows = groups
    .filter(Array.isArray)
    .sort((left, right) => right.length - left.length)[0];
  if (!rows || !rows.length) {
    throw new Error('Puan cetveli satırları boş.');
  }

  return rows.map((row) => ({
    rank: Number(row.rank),
    teamId: Number(row.team?.id || 0),
    team: String(row.team?.name || ''),
    played: Number(row.all?.played || 0),
    won: Number(row.all?.win || 0),
    drawn: Number(row.all?.draw || 0),
    lost: Number(row.all?.lose || 0),
    goalsFor: Number(row.all?.goals?.for || 0),
    goalsAgainst: Number(row.all?.goals?.against || 0),
    goalDifference: Number(row.goalsDiff || 0),
    points: Number(row.points || 0),
    form: String(row.form || ''),
    description: String(row.description || '')
  })).filter((row) => row.rank && row.team);
}

function normalizeFixtures(body) {
  const fixtures = Array.isArray(body && body.response) ? body.response : [];
  return fixtures
    .map((fixture) => ({
      id: Number(fixture.fixture?.id || 0),
      date: String(fixture.fixture?.date || ''),
      timestamp: Number(fixture.fixture?.timestamp || 0),
      round: String(fixture.league?.round || ''),
      status: String(fixture.fixture?.status?.short || ''),
      statusLong: String(fixture.fixture?.status?.long || ''),
      venue: String(fixture.fixture?.venue?.name || ''),
      home: String(fixture.teams?.home?.name || ''),
      away: String(fixture.teams?.away?.name || '')
    }))
    .filter((fixture) =>
      fixture.id &&
      fixture.date &&
      fixture.home &&
      fixture.away &&
      UPCOMING_STATUSES.has(fixture.status)
    )
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(0, 12);
}

async function fetchApi(endpoint, params, key) {
  const query = new URLSearchParams(params);
  const response = await fetch(API_ROOT + endpoint + '?' + query, {
    headers: { 'x-apisports-key': key }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error('API-Football isteği başarısız: HTTP ' + response.status);
  }
  const errors = apiErrors(body);
  if (errors.length) {
    throw new Error('API-Football hatası: ' + errors.join(' | '));
  }
  return body;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}

async function main() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error('API_FOOTBALL_KEY bulunamadı — GitHub Secrets kontrol edin.');
  }

  const season = seasonFor();
  const spacing = Math.max(
    0,
    Number(process.env.API_FOOTBALL_MIN_DELAY_MS || 6500)
  );
  const leagues = {};

  for (let index = 0; index < LEAGUES.length; index += 1) {
    const league = LEAGUES[index];
    const common = {
      league: String(league.id),
      season: String(season)
    };
    const standingsBody = await fetchApi('/standings', common, key);
    if (spacing) await delay(spacing);
    const fixturesBody = await fetchApi('/fixtures', {
      ...common,
      next: '12',
      timezone: TIMEZONE
    }, key);

    leagues[league.key] = {
      ...league,
      standings: normalizeStandings(standingsBody),
      fixtures: normalizeFixtures(fixturesBody)
    };

    console.log(
      league.name + ': ' + leagues[league.key].standings.length +
      ' takım, ' + leagues[league.key].fixtures.length + ' yaklaşan maç.'
    );
    if (index < LEAGUES.length - 1 && spacing) await delay(spacing);
  }

  const output = {
    updatedAt: new Date().toISOString(),
    source: 'API-Football',
    sourceUrl: 'https://www.api-football.com/',
    timezone: TIMEZONE,
    season,
    seasonLabel: season + '/' + String(season + 1).slice(-2),
    leagues
  };
  writeJsonAtomic(OUTPUT_PATH, output);
  console.log('Avrupa lig merkezi verisi yazıldı: ' + LEAGUES.length + ' lig.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  LEAGUES,
  apiErrors,
  normalizeFixtures,
  normalizeStandings,
  seasonFor
};

