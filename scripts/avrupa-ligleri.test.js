'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LEAGUES,
  normalizeFixtures,
  normalizeStandings,
  seasonFor,
  tableRows
} = require('./fetch-avrupa-ligleri');

function standing(rank, team, points) {
  return {
    idx: rank,
    id: rank,
    name: team,
    pts: points,
    goalConDiff: points - 2,
    scoresStr: '7-3',
    played: 3,
    wins: 2,
    draws: 1,
    losses: 0,
    qualColor: '#2AD572'
  };
}

function fixture(id, date, started, finished, home, away) {
  return {
    id,
    round: '4',
    status: { utcTime: date, started, finished, cancelled: false },
    home: { name: home },
    away: { name: away }
  };
}

test('alti buyuk Avrupa ligi dogru API kimlikleriyle tanimlidir', () => {
  assert.deepEqual(
    LEAGUES.map((league) => league.id),
    [39, 140, 135, 61, 78, 88]
  );
});

test('sezon baslangic yili Istanbul takvimine gore hesaplanir', () => {
  assert.equal(seasonFor(new Date('2026-06-30T20:30:00Z')), 2025);
  assert.equal(seasonFor(new Date('2026-06-30T22:30:00Z')), 2026);
});

test('puan cetveli FotMob tablosundan okunur ve gorunen alanlari korur', () => {
  const rows = normalizeStandings({
    table: [{
      data: {
        table: {
          all: [standing(1, 'Arsenal', 7), standing(2, 'Liverpool', 5)]
        }
      }
    }]
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    rank: 1,
    teamId: 1,
    team: 'Arsenal',
    played: 3,
    won: 2,
    drawn: 1,
    lost: 0,
    goalsFor: 7,
    goalsAgainst: 3,
    goalDifference: 5,
    points: 7,
    form: '',
    description: '#2AD572'
  });
  assert.equal(tableRows({ table: [] }).length, 0);
});

test('yalniz oynanacak maclar kronolojik siralanir', () => {
  const rows = normalizeFixtures({
    fixtures: { allMatches: [
      fixture(2, '2026-09-04T19:00:00Z', false, false, 'B', 'C'),
      fixture(3, '2026-09-03T17:00:00Z', true, true, 'D', 'E'),
      fixture(1, '2026-09-04T16:00:00Z', false, false, 'A', 'B')
    ] }
  });
  assert.deepEqual(rows.map((row) => row.id), [1, 2]);
});

test('eksik FotMob puan cetveli reddedilir', () => {
  assert.throws(() => normalizeStandings({ table: [] }), /satır bulunamadı/);
});
