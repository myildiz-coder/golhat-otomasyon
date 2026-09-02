'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LEAGUES,
  apiErrors,
  normalizeFixtures,
  normalizeStandings,
  seasonFor
} = require('./fetch-avrupa-ligleri');

function standing(rank, team, points) {
  return {
    rank,
    team: { id: rank, name: team },
    points,
    goalsDiff: points - 2,
    form: 'WWD',
    description: null,
    all: {
      played: 3,
      win: 2,
      draw: 1,
      lose: 0,
      goals: { for: 7, against: 3 }
    }
  };
}

function fixture(id, date, status, home, away) {
  return {
    fixture: {
      id,
      date,
      timestamp: Math.floor(new Date(date).getTime() / 1000),
      status: { short: status, long: status },
      venue: { name: 'Stadyum' }
    },
    league: { round: 'Regular Season - 4' },
    teams: { home: { name: home }, away: { name: away } }
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

test('puan cetveli en genis gruptan okunur ve gorunen alanlari korur', () => {
  const rows = normalizeStandings({
    response: [{
      league: {
        standings: [
          [standing(1, 'A', 7)],
          [standing(1, 'Arsenal', 7), standing(2, 'Liverpool', 5)]
        ]
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
    form: 'WWD',
    description: ''
  });
});

test('yalniz oynanacak maclar kronolojik siralanir', () => {
  const rows = normalizeFixtures({
    response: [
      fixture(2, '2026-09-04T22:00:00+03:00', 'NS', 'B', 'C'),
      fixture(3, '2026-09-03T20:00:00+03:00', 'FT', 'D', 'E'),
      fixture(1, '2026-09-04T19:00:00+03:00', 'PST', 'A', 'B')
    ]
  });
  assert.deepEqual(rows.map((row) => row.id), [1, 2]);
});

test('API hata bicimleri tek listeye indirilir', () => {
  assert.deepEqual(apiErrors({ errors: { quota: 'Limit', token: 'Invalid' } }), [
    'Limit',
    'Invalid'
  ]);
});
