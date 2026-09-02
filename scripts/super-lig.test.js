'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  seasonFor,
  roundLabel,
  normalizeStandings,
  normalizeFixtures
} = require('./fetch-super-lig');

test('Türkiye sezon yılı temmuz ayında değişir', () => {
  assert.equal(seasonFor(new Date('2026-06-30T20:00:00Z')), 2025);
  assert.equal(seasonFor(new Date('2026-06-30T22:00:00Z')), 2026);
});

test('API tur adı Türkçe hafta etiketine dönüşür', () => {
  assert.equal(roundLabel('Regular Season - 4'), '4. Hafta');
  assert.equal(roundLabel(''), 'Sıradaki Hafta');
});

test('puan cetveli yalnızca gereken alanlara indirgenir', () => {
  const output = normalizeStandings({
    response: [{
      league: {
        standings: [[{
          rank: 1,
          team: { name: 'Galatasaray', logo: 'https://example.test/logo.png' },
          all: { played: 3, win: 2, draw: 1, lose: 0, goals: { for: 8, against: 3 } },
          goalsDiff: 5,
          points: 7,
          form: 'WDW'
        }]]
      }
    }]
  });

  assert.deepEqual(output[0], {
    rank: 1,
    team: 'Galatasaray',
    played: 3,
    won: 2,
    drawn: 1,
    lost: 0,
    goalsFor: 8,
    goalsAgainst: 3,
    goalDifference: 5,
    points: 7,
    form: 'WDW'
  });
  assert.equal(Object.hasOwn(output[0], 'logo'), false);
});

test('yalnızca henüz başlamamış maçlar tarih sırasıyla döner', () => {
  const output = normalizeFixtures({
    response: [
      {
        fixture: {
          id: 2,
          date: '2026-09-06T17:00:00Z',
          timestamp: 1788714000,
          status: { short: 'NS', long: 'Not Started' },
          venue: { name: 'Stadyum B' }
        },
        league: { round: 'Regular Season - 4' },
        teams: { home: { name: 'Takım B' }, away: { name: 'Takım C' } }
      },
      {
        fixture: {
          id: 1,
          date: '2026-09-05T17:00:00Z',
          timestamp: 1788627600,
          status: { short: 'NS', long: 'Not Started' },
          venue: { name: 'Stadyum A' }
        },
        league: { round: 'Regular Season - 4' },
        teams: { home: { name: 'Takım A' }, away: { name: 'Takım B' } }
      },
      {
        fixture: {
          id: 3,
          date: '2026-09-04T17:00:00Z',
          timestamp: 1788541200,
          status: { short: 'FT', long: 'Match Finished' },
          venue: { name: 'Stadyum C' }
        },
        league: { round: 'Regular Season - 3' },
        teams: { home: { name: 'Takım C' }, away: { name: 'Takım A' } }
      }
    ]
  });

  assert.deepEqual(output.map((fixture) => fixture.id), [1, 2]);
  assert.equal(output[0].round, 'Regular Season - 4');
});
