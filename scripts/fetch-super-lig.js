'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LEAGUE_ID = 203;
const API_ROOT = 'https://v3.football.api-sports.io';
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'super-lig.json');
const UPCOMING_STATUSES = new Set(['NS', 'TBD', 'PST']);

function istanbulDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)])
  );
}

function seasonFor(value = new Date()) {
  const parts = istanbulDateParts(value);
  return parts.month >= 7 ? parts.year : parts.year - 1;
}

function roundLabel(value) {
  const match = String(value || '').match(/(\d+)\s*$/);
  return match ? match[1] + '. Hafta' : String(value || 'Sıradaki Hafta');
}

function normalizeStandings(body) {
  const rows = body.response?.[0]?.league?.standings?.[0];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Süper Lig puan cetveli API yanıtında bulunamadı');
  }

  return rows.map((row) => ({
    rank: Number(row.rank),
    team: String(row.team?.name || ''),
    played: Number(row.all?.played || 0),
    won: Number(row.all?.win || 0),
    drawn: Number(row.all?.draw || 0),
    lost: Number(row.all?.lose || 0),
    goalsFor: Number(row.all?.goals?.for || 0),
    goalsAgainst: Number(row.all?.goals?.against || 0),
    goalDifference: Number(row.goalsDiff || 0),
    points: Number(row.points || 0),
    form: String(row.form || '')
  }));
}

function normalizeFixtures(body) {
  const fixtures = Array.isArray(body.response) ? body.response : [];
  return fixtures
    .map((fixture) => ({
      id: Number(fixture.fixture?.id),
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
    .sort((left, right) => left.timestamp - right.timestamp);
}

async function fetchApi(endpoint, key) {
  const response = await fetch(API_ROOT + endpoint, {
    headers: { 'x-apisports-key': key }
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error('API-Football isteği başarısız: HTTP ' + response.status);
  }

  const errors = body.errors && typeof body.errors === 'object'
    ? Object.values(body.errors).filter(Boolean)
    : [];
  if (errors.length > 0) {
    throw new Error('API-Football hatası: ' + errors.join(' | '));
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
  if (!key) throw new Error('API_FOOTBALL_KEY bulunamadı — GitHub Secrets kontrol edin.');

  const season = seasonFor();
  const query = '?league=' + LEAGUE_ID + '&season=' + season;
  const [standingsBody, fixturesBody] = await Promise.all([
    fetchApi('/standings' + query, key),
    fetchApi('/fixtures' + query + '&next=20', key)
  ]);

  const standings = normalizeStandings(standingsBody);
  const allUpcoming = normalizeFixtures(fixturesBody);
  const selectedRound = allUpcoming[0]?.round || '';
  const fixtures = selectedRound
    ? allUpcoming.filter((fixture) => fixture.round === selectedRound)
    : [];

  const output = {
    updatedAt: new Date().toISOString(),
    source: 'API-Football',
    leagueId: LEAGUE_ID,
    season,
    seasonLabel: season + '/' + String(season + 1).slice(-2),
    round: selectedRound,
    roundLabel: roundLabel(selectedRound),
    standings,
    fixtures
  };

  writeJsonAtomic(OUTPUT_PATH, output);
  console.log(
    'Süper Lig verisi yazıldı: ' + standings.length +
    ' takım, ' + fixtures.length + ' yaklaşan maç, ' + output.roundLabel
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  seasonFor,
  roundLabel,
  normalizeStandings,
  normalizeFixtures
};
