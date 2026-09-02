'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TRACKED_LEAGUES,
  istanbulDateString,
  matchKind,
  normalizeFixtures,
  summaryFor
} = require('./fetch-canli-skor');

function fixture(id, leagueId, date, status, home, away, homeScore = null, awayScore = null) {
  return {
    fixture: {
      id,
      date,
      timestamp: Math.floor(new Date(date).getTime() / 1000),
      venue: { name: 'Test Stadi' },
      status: { short: status, long: status, elapsed: status === '2H' ? 67 : null }
    },
    league: { id: leagueId, name: 'Lig ' + leagueId, country: 'Test', round: '4. Hafta' },
    teams: {
      home: { name: home, logo: 'https://example.test/home.png' },
      away: { name: away, logo: 'https://example.test/away.png' }
    },
    goals: { home: homeScore, away: awayScore }
  };
}

test('Eredivisie canli skor kapsamindadir', () => {
  assert.equal(TRACKED_LEAGUES.includes(88), true);
});

test('Istanbul gunu UTC gece sinirinda dogru hesaplanir', () => {
  assert.equal(istanbulDateString(new Date('2026-06-30T20:30:00Z')), '2026-06-30');
  assert.equal(istanbulDateString(new Date('2026-06-30T22:30:00Z')), '2026-07-01');
});

test('gunluk maclar takip edilen liglerle sinirlanir ve lig onceligine gore siralanir', () => {
  const matches = normalizeFixtures({
    response: [
      fixture(2, 39, '2026-09-02T18:00:00+03:00', 'NS', 'Arsenal', 'Liverpool'),
      fixture(1, 203, '2026-09-02T20:00:00+03:00', '2H', 'Galatasaray', 'Besiktas', 2, 1),
      fixture(3, 999, '2026-09-02T15:00:00+03:00', 'FT', 'Diger A', 'Diger B', 1, 0)
    ]
  });

  assert.deepEqual(matches.map((match) => match.id), [1, 2]);
  assert.equal(matches[0].kind, 'live');
  assert.equal(matches[0].minute, 67);
  assert.equal(matches[1].kind, 'upcoming');
  assert.equal(Object.hasOwn(matches[0], 'logo'), false);
});

test('durumlar ve ozet sayilari canli, oynanacak ve biten olarak ayrilir', () => {
  assert.equal(matchKind('HT'), 'live');
  assert.equal(matchKind('NS'), 'upcoming');
  assert.equal(matchKind('PEN'), 'finished');
  assert.equal(matchKind('PST'), 'other');

  assert.deepEqual(summaryFor([
    { kind: 'live' },
    { kind: 'upcoming' },
    { kind: 'upcoming' },
    { kind: 'finished' },
    { kind: 'other' }
  ]), { total: 5, live: 1, upcoming: 2, finished: 1 });
});
