'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_ROOT = 'https://www.fotmob.com/api/data/leagues';
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'avrupa-ligleri.json');
const TIMEZONE = 'Europe/Istanbul';
const LEAGUES = [
  { key: 'england', id: 39, fotmobId: 47, country: 'İngiltere', name: 'Premier League' },
  { key: 'spain', id: 140, fotmobId: 87, country: 'İspanya', name: 'La Liga' },
  { key: 'italy', id: 135, fotmobId: 55, country: 'İtalya', name: 'Serie A' },
  { key: 'france', id: 61, fotmobId: 53, country: 'Fransa', name: 'Ligue 1' },
  { key: 'germany', id: 78, fotmobId: 54, country: 'Almanya', name: 'Bundesliga' },
  { key: 'netherlands', id: 88, fotmobId: 57, country: 'Hollanda', name: 'Eredivisie' }
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

function tableRows(body) {
  const blocks = Array.isArray(body && body.table) ? body.table : [];
  const block = blocks.find((item) =>
    Array.isArray(item?.data?.table?.all)
  );
  return block?.data?.table?.all || [];
}

function normalizeStandings(body) {
  const rows = tableRows(body);
  if (!rows.length) {
    throw new Error('FotMob puan cetveli yanıtında satır bulunamadı.');
  }

  return rows.map((row) => {
    const score = String(row.scoresStr || '0-0')
      .split('-')
      .map((value) => Number(value.trim()) || 0);
    return {
      rank: Number(row.idx),
      teamId: Number(row.id || 0),
      team: String(row.name || ''),
      played: Number(row.played || 0),
      won: Number(row.wins || 0),
      drawn: Number(row.draws || 0),
      lost: Number(row.losses || 0),
      goalsFor: score[0] || 0,
      goalsAgainst: score[1] || 0,
      goalDifference: Number(row.goalConDiff || 0),
      points: Number(row.pts || 0),
      form: '',
      description: String(row.qualColor || '')
    };
  }).filter((row) => row.rank && row.team);
}

function normalizeFixtures(body) {
  const fixtures = Array.isArray(body?.fixtures?.allMatches)
    ? body.fixtures.allMatches
    : [];
  return fixtures
    .map((fixture) => ({
      id: Number(fixture.id || 0),
      date: String(fixture.status?.utcTime || ''),
      timestamp: Math.floor(
        new Date(fixture.status?.utcTime || 0).getTime() / 1000
      ),
      round: String(fixture.round || ''),
      status: fixture.status?.cancelled ? 'PST' : 'NS',
      statusLong: fixture.status?.cancelled ? 'Postponed' : 'Not Started',
      venue: '',
      home: String(fixture.home?.name || ''),
      away: String(fixture.away?.name || ''),
      started: Boolean(fixture.status?.started),
      finished: Boolean(fixture.status?.finished),
      cancelled: Boolean(fixture.status?.cancelled)
    }))
    .filter((fixture) =>
      fixture.id &&
      fixture.date &&
      fixture.home &&
      fixture.away &&
      !fixture.started &&
      !fixture.finished
    )
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(0, 12);
}

async function fetchLeague(league, seasonLabel) {
  const query = new URLSearchParams({
    id: String(league.fotmobId),
    ccode3: 'TUR',
    timezone: TIMEZONE,
    season: seasonLabel
  });
  const response = await fetch(DATA_ROOT + '?' + query, {
    headers: {
      accept: 'application/json',
      'user-agent': 'GOLHAT/1.0 (+https://golhat.com)'
    }
  });
  if (!response.ok) {
    throw new Error(
      league.name + ' FotMob isteği başarısız: HTTP ' + response.status
    );
  }
  return response.json();
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}

async function main() {
  const season = seasonFor();
  const seasonLabel = season + '/' + String(season + 1);
  const leagues = {};

  for (const league of LEAGUES) {
    const body = await fetchLeague(league, seasonLabel);

    leagues[league.key] = {
      ...league,
      standings: normalizeStandings(body),
      fixtures: normalizeFixtures(body)
    };

    console.log(
      league.name + ': ' + leagues[league.key].standings.length +
      ' takım, ' + leagues[league.key].fixtures.length + ' yaklaşan maç.'
    );
  }

  const output = {
    updatedAt: new Date().toISOString(),
    source: 'FotMob',
    sourceUrl: 'https://www.fotmob.com/',
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
  normalizeFixtures,
  normalizeStandings,
  seasonFor,
  tableRows
};

