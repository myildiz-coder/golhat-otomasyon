'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TRACKED_LEAGUES,
  istanbulDateString,
  matchKind,
  normalizeFotmobMatches,
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

test('skor sayfası başlamamış maçlarda yanıltıcı 0-0 göstermez', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'skor.html'), 'utf8');
  assert.match(html, /function score\(m,v\)\{return kind\(m\)==='upcoming'\?'\\u2014'/);
  assert.match(html, /score\(m,m\.homeScore\)/);
  assert.match(html, /score\(m,m\.awayScore\)/);
});

test('FotMob yedek akışı aynı canlı skor şemasına dönüştürülür', () => {
  const matches = normalizeFotmobMatches({
    leagues: [{
      ccode: 'ENG',
      name: 'Premier League',
      matches: [{
        id: 44,
        tournamentStage: '5',
        home: { name: 'Arsenal', longName: 'Arsenal FC', score: 1 },
        away: { name: 'Liverpool', score: 1 },
        status: {
          utcTime: '2026-09-02T18:00:00.000Z',
          started: true,
          finished: false,
          cancelled: false,
          liveTime: { short: '67' },
          reason: { long: 'Second Half' }
        }
      }]
    }]
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].leagueId, 39);
  assert.equal(matches[0].kind, 'live');
  assert.equal(matches[0].minute, 67);
  assert.equal(matches[0].home, 'Arsenal FC');
});
