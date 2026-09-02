'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  COMPETITIONS,
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
