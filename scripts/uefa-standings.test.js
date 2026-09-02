'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  COMPETITIONS,
  normalizeFixtures,
  normalizeRows,
  seasonEndYear,
  translatedTeamName
} = require('./fetch-uefa-standings');

function item(rank, name, values = {}) {
  return {
    rank,
    teamId: String(1000 + rank),
    team: {
      id: String(1000 + rank),
      internationalName: name,
      teamCode: name.slice(0, 3).toUpperCase(),
      countryCode: values.countryCode || 'ENG',
      translations: values.translations || {}
    },
    played: values.played || 0,
    won: values.won || 0,
    drawn: values.drawn || 0,
    lost: values.lost || 0,
    goalsFor: values.goalsFor || 0,
    goalsAgainst: values.goalsAgainst || 0,
    goalDifference: values.goalDifference || 0,
    points: values.points || 0,
    totalPoints: values.totalPoints || 0
  };
}

test('UEFA season uses the ending year', () => {
  assert.equal(seasonEndYear(new Date('2026-06-30T12:00:00Z')), 2026);
  assert.equal(seasonEndYear(new Date('2026-07-01T12:00:00Z')), 2027);
});

test('three official UEFA competition ids are configured', () => {
  assert.deepEqual(
    COMPETITIONS.map((competition) => competition.id),
    [1, 14, 2019]
  );
});

test('the largest UEFA standings group is normalized and sorted', () => {
  const rows = normalizeRows([
    { items: [item(1, 'Qualification Team')] },
    {
      items: [
        item(2, 'Galatasaray', {
          countryCode: 'TUR',
          played: 1,
          drawn: 1,
          goalsFor: 2,
          goalsAgainst: 2,
          points: 1
        }),
        item(1, 'Arsenal', {
          played: 1,
          won: 1,
          goalsFor: 3,
          goalDifference: 3,
          points: 3
        })
      ]
    }
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].team, 'Arsenal');
  assert.equal(rows[0].points, 3);
  assert.equal(rows[1].countryCode, 'TUR');
  assert.equal(rows[1].drawn, 1);
});

test('English display name is preferred when available', () => {
  assert.equal(translatedTeamName({
    internationalName: 'Fallback',
    translations: { displayName: { EN: 'Bayern Munich' } }
  }), 'Bayern Munich');
});

test('empty UEFA standings are rejected', () => {
  assert.throws(
    () => normalizeRows([{ items: [] }]),
    /standings are empty/
  );
});

test('next UEFA matchday includes every upcoming match in that week', () => {
  const makeMatch = (id, date, matchdayId, sequence, phase = 'TOURNAMENT') => ({
    id: String(id),
    status: 'UPCOMING',
    competitionPhase: phase,
    kickOffTime: { dateTime: date },
    matchday: {
      id: matchdayId,
      sequenceNumber: String(sequence),
      longName: 'Matchday ' + sequence
    },
    round: { id: 'league', metaData: { name: 'League Phase' } },
    homeTeam: {
      id: 'h' + id,
      internationalName: 'Home ' + id,
      countryCode: 'TUR'
    },
    awayTeam: {
      id: 'a' + id,
      internationalName: 'Away ' + id,
      countryCode: 'ENG'
    }
  });
  const result = normalizeFixtures([
    makeMatch(4, '2026-09-16T19:00:00Z', 'md2', 2),
    makeMatch(2, '2026-09-09T19:00:00Z', 'md1', 1),
    makeMatch(1, '2026-09-09T16:45:00Z', 'md1', 1),
    makeMatch(3, '2026-09-08T16:45:00Z', 'qual', 4, 'QUALIFYING')
  ], new Date('2026-09-02T12:00:00Z'));

  assert.equal(result.label, '1. Hafta');
  assert.deepEqual(result.matches.map((match) => match.id), ['1', '2']);
  assert.equal(result.matches[0].home, 'Home 1');

  assert.equal(result.matches[0].homeCountry, 'TUR');
});

test('competition rail uses five explicit columns and protects team names', () => {
  const css = fs.readFileSync(
    path.join(__dirname, '..', 'styles', 'uefa-standings.css'),
    'utf8'
  );

  assert.match(
    css,
    /\.competition-page \.uefa-table tr\{[\s\S]*?display:grid;[\s\S]*?grid-template-columns:32px minmax\(150px,1fr\) 32px 34px 32px;/
  );
  assert.match(
    css,
    /\.competition-page \.uefa-table \.optional\{\s*display:none;/
  );
  assert.match(
    css,
    /\.competition-page \.uefa-team-name\{[\s\S]*?white-space:normal;[\s\S]*?font-size:\.86rem;/
  );
});
