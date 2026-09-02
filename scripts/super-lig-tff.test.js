'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decodeEntities,
  fixtureDateIso,
  parseTffPage
} = require('./fetch-super-lig-tff');

function standingRow(rank, team, values) {
  const cells = values.map((value, index) =>
    '<td><span id="standing_' + rank + '_' + index + '">' + value + '</span></td>'
  ).join('');
  return '<tr><td><a id="standing_' + rank + '_lnkTakim">' +
    rank + '.' + team + '</a></td>' + cells + '</tr>';
}

function fixtureRow(id, date, time, home, away, homeScore = '', awayScore = '') {
  return '<tr class="haftaninMaclariTr">' +
    '<td><span id="fixture_' + id + '_lblTarih">' + date + '</span>' +
    '<span id="fixture_' + id + '_lblSaat">' + time + '</span></td>' +
    '<td><span id="fixture_' + id + '_Label4">' + home + '</span></td>' +
    '<td><a href="Default.aspx?pageId=29&macId=' + id + '">' +
    '<span id="fixture_' + id + '_Label5">' + homeScore + '</span>-' +
    '<span id="fixture_' + id + '_Label6">' + awayScore + '</span></a></td>' +
    '<td><span id="fixture_' + id + '_Label1">' + away + '</span></td>' +
    '</tr>';
}

function tffFixture() {
  const standings = Array.from({ length: 10 }, (_, index) =>
    standingRow(
      index + 1,
      index === 0 ? 'GALATASARAY A.\u015e.' : 'TAKIM ' + (index + 1),
      [3, 2, 1, 0, 8 - index, 3, 5 - index, 7 - index]
    )
  ).join('');

  return '<div>Trendyol S\u00fcper Lig 2026-2027 Sezonu Fikst\u00fcr\u00fc</div>' +
    '<td class=haftaNoActive><a href="?hafta=4">4</a></td>' +
    '<table id="league_dtlHaftaninMaclari">' +
    fixtureRow(317813, '04.09.2026', '20:00', '\u0130STANBUL BA\u015eAK\u015eEH\u0130R FK', 'GALATASARAY A.\u015e.') +
    fixtureRow(317819, '05.09.2026', '17:00', 'ERZURUMSPOR FK', 'T\u00dcMOSAN KONYASPOR') +
    fixtureRow(317700, '29.08.2026', '20:00', 'ESK\u0130 EV', 'ESK\u0130 DEP', '2', '1') +
    '</table>' +
    '<div>Trendyol S\u00fcper Lig 2026-2027 Sezonu Puan Cetveli</div>' +
    '<table class="s-table"><tbody>' + standings + '</tbody></table>';
}

test('TFF sayfasi sezonu, puan cetvelini ve aktif haftayi ayristirir', () => {
  const output = parseTffPage(tffFixture());

  assert.equal(output.season, 2026);
  assert.equal(output.seasonLabel, '2026/27');
  assert.equal(output.roundLabel, '4. Hafta');
  assert.equal(output.standings.length, 10);
  assert.deepEqual(output.standings[0], {
    rank: 1,
    team: 'GALATASARAY A.\u015e.',
    played: 3,
    won: 2,
    drawn: 1,
    lost: 0,
    goalsFor: 8,
    goalsAgainst: 3,
    goalDifference: 5,
    points: 7,
    form: ''
  });
  assert.deepEqual(output.fixtures.map((fixture) => fixture.id), [317813, 317819]);
  assert.equal(output.fixtures[0].home, '\u0130STANBUL BA\u015eAK\u015eEH\u0130R FK');
});

test('TFF saati Istanbul saatinden UTC ISO tarihine donusur', () => {
  assert.equal(fixtureDateIso('04.09.2026', '20:00'), '2026-09-04T17:00:00.000Z');
  assert.equal(fixtureDateIso('belirsiz', ''), '');
});

test('HTML varliklari takim adinda guvenle cozulur', () => {
  assert.equal(decodeEntities('A &amp; B &#304;'), 'A & B \u0130');
});
