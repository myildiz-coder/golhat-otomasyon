'use strict';

const fs = require('node:fs');
const path = require('node:path');

const API_ROOT = 'https://standings.uefa.com/v1/standings';
const MATCHES_ROOT = 'https://match.uefa.com/v5/matches';
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'uefa-standings.json');
const COMPETITIONS = [
  {
    key: 'champions',
    id: 1,
    name: 'UEFA Champions League',
    pageUrl: 'https://www.uefa.com/uefachampionsleague/standings/'
  },
  {
    key: 'europa',
    id: 14,
    name: 'UEFA Europa League',
    pageUrl: 'https://www.uefa.com/uefaeuropaleague/standings/'
  },
  {
    key: 'conference',
    id: 2019,
    name: 'UEFA Conference League',
    pageUrl: 'https://www.uefa.com/uefaconferenceleague/standings/'
  }
];

function seasonEndYear(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
  return values.month >= 7 ? values.year + 1 : values.year;
}

function translatedTeamName(team) {
  const translations = team && team.translations;
  const names = translations && translations.displayName;
  return String(
    names && (names.TR || names.EN) ||
    team && team.internationalName ||
    ''
  );
}

function normalizeRows(body) {
  if (!Array.isArray(body)) {
    throw new Error('UEFA standings response is not an array.');
  }

  const table = body
    .filter((group) => Array.isArray(group && group.items))
    .sort((left, right) => right.items.length - left.items.length)[0];

  if (!table || table.items.length === 0) {
    throw new Error('UEFA league-phase standings are empty.');
  }

  return table.items
    .map((item) => ({
      rank: Number(item.rank || 0),
      teamId: String(item.teamId || item.team && item.team.id || ''),
      team: translatedTeamName(item.team),
      code: String(item.team && item.team.teamCode || ''),
      countryCode: String(item.team && item.team.countryCode || ''),
      played: Number(item.played || 0),
      won: Number(item.won || 0),
      drawn: Number(item.drawn || 0),
      lost: Number(item.lost || 0),
      goalsFor: Number(item.goalsFor || 0),
      goalsAgainst: Number(item.goalsAgainst || 0),
      goalDifference: Number(item.goalDifference || 0),
      points: Number(item.points || item.totalPoints || 0)
    }))
    .filter((row) => row.rank && row.teamId && row.team)
    .sort((left, right) => left.rank - right.rank);
}
function matchdayLabel(match) {
  const sequence = Number(
    match && match.matchday && match.matchday.sequenceNumber || 0
  );
  if (sequence) return sequence + '. Hafta';

  const translations =
    match && match.matchday && match.matchday.translations;
  const longName = translations && translations.longName;
  return String(
    longName && (longName.TR || longName.EN) ||
    match && match.matchday && match.matchday.longName ||
    match && match.round && match.round.metaData &&
      match.round.metaData.name ||
    'Siradaki Maclar'
  );
}

function matchdayKey(match) {
  return String(
    match && match.matchday && match.matchday.id ||
    match && match.round && match.round.id ||
    ''
  );
}

function normalizeFixtures(body, now = new Date()) {
  if (!Array.isArray(body)) {
    throw new Error('UEFA matches response is not an array.');
  }

  const threshold = now.getTime() - 60 * 1000;
  const upcoming = body
    .filter((match) => (
      match &&
      match.competitionPhase === 'TOURNAMENT' &&
      match.status === 'UPCOMING' &&
      new Date(match.kickOffTime && match.kickOffTime.dateTime)
        .getTime() >= threshold
    ))
    .sort((left, right) => (
      new Date(left.kickOffTime.dateTime).getTime() -
      new Date(right.kickOffTime.dateTime).getTime()
    ));

  if (!upcoming.length) {
    return {
      id: '',
      label: 'Program Bekleniyor',
      dateFrom: '',
      dateTo: '',
      matches: []
    };
  }

  const first = upcoming[0];
  const key = matchdayKey(first);
  const selected = upcoming.filter((match) => matchdayKey(match) === key);
  const matches = selected.map((match) => ({
    id: String(match.id || ''),
    date: String(match.kickOffTime && match.kickOffTime.dateTime || ''),
    timestamp: new Date(
      match.kickOffTime && match.kickOffTime.dateTime
    ).getTime(),
    home: translatedTeamName(match.homeTeam),
    away: translatedTeamName(match.awayTeam),
    homeCountry: String(match.homeTeam && match.homeTeam.countryCode || ''),
    awayCountry: String(match.awayTeam && match.awayTeam.countryCode || ''),
    status: String(match.status || '')
  })).filter((match) => (
    match.id && match.date && match.home && match.away
  ));

  return {
    id: key,
    label: matchdayLabel(first),
    dateFrom: matches[0] && matches[0].date || '',
    dateTo: matches[matches.length - 1] &&
      matches[matches.length - 1].date || '',
    matches
  };
}

async function fetchJson(url, competitionName) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' }
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      competitionName + ' request failed: HTTP ' + response.status
    );
  }
  if (body && body.error) {
    throw new Error(
      competitionName + ' error: ' +
      (body.error.message || body.error.title || 'unknown error')
    );
  }
  return body;
}

async function fetchCompetition(competition, season) {
  const baseQuery = {
    competitionId: String(competition.id),
    seasonYear: String(season)
  };
  const standingsQuery = new URLSearchParams(baseQuery);
  const matchesQuery = new URLSearchParams({
    ...baseQuery,
    limit: '500',
    offset: '0',
    order: 'ASC'
  });
  const [standingsBody, matchesBody] = await Promise.all([
    fetchJson(
      API_ROOT + '?' + standingsQuery,
      competition.name + ' standings'
    ),
    fetchJson(
      MATCHES_ROOT + '?' + matchesQuery,
      competition.name + ' matches'
    )
  ]);

  return {
    id: competition.id,
    name: competition.name,
    pageUrl: competition.pageUrl,
    standings: normalizeRows(standingsBody),
    nextMatchday: normalizeFixtures(matchesBody)
  };
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}

async function main() {
  const season = seasonEndYear();
  const results = await Promise.all(
    COMPETITIONS.map((competition) => fetchCompetition(competition, season))
  );
  const competitions = Object.fromEntries(
    results.map((competition, index) => [
      COMPETITIONS[index].key,
      competition
    ])
  );
  const output = {
    updatedAt: new Date().toISOString(),
    source: 'UEFA',
    sourceUrl: 'https://standings.uefa.com/',
    seasonEndYear: season,
    seasonLabel: String(season - 1) + '/' + String(season).slice(-2),
    competitions
  };

  writeJsonAtomic(OUTPUT_PATH, output);
  console.log(
    'UEFA standings written: ' +
    results.map((item) => item.name + ' ' + item.standings.length).join(', ')
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  COMPETITIONS,
  matchdayLabel,
  normalizeFixtures,
  normalizeRows,
  seasonEndYear,
  translatedTeamName
};
