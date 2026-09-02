'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CLUBS, kapDateToIso, normalizeClub, normalizeKapDisclosures, normalizeMatch } =
  require('./fetch-kulup-merkezi');

function fixture(id, date, status, homeScore, awayScore) {
  return {
    id,
    home: { id: 8695, name: 'Fenerbahçe', score: homeScore },
    away: { id: 10188, name: 'Beşiktaş', score: awayScore },
    tournament: { name: 'Super Lig', stage: '4. Hafta' },
    status: { utcTime: date, ...status, reason: { short: status.finished ? 'FT' : 'NS' } }
  };
}

test('dört büyük kulübün kimlikleri sabittir', () => {
  assert.deepEqual(CLUBS.map((club) => club.id), [8695, 8637, 10188, 9752]);
});

test('kulübün biten maç sonucu kendi açısından hesaplanır', () => {
  const won = normalizeMatch(
    fixture(1, '2026-09-01T17:00:00Z', { started: true, finished: true }, 2, 1), 8695
  );
  assert.equal(won.kind, 'finished');
  assert.equal(won.result, 'W');
});

test('kulüp özeti yaklaşan ve son maçları doğru ayırır', () => {
  const config = CLUBS[0];
  const body = {
    details: {
      name: 'Fenerbahçe', latestSeason: '2026/2027', primaryLeagueName: 'Super Lig',
      seopath: 'fenerbahce', sportsTeamJSONLD: { location: { name: 'Kadıköy' } }
    },
    fixtures: { allFixtures: { fixtures: [
      fixture(1, '2026-09-01T17:00:00Z', { started: true, finished: true }, 2, 1),
      fixture(2, '2026-09-05T17:00:00Z', { started: false, finished: false }, null, null)
    ] } },
    squad: { squad: [
      { title: 'coach', members: [{ name: 'Teknik Direktör' }] },
      { title: 'keepers', members: [{ name: 'Kaleci', injury: null }] },
      { title: 'defenders', members: [{ name: 'Savunmacı', injury: { expectedReturn: 'soon' } }] }
    ] }
  };
  const club = normalizeClub(body, config);
  assert.equal(club.nextMatches.length, 1);
  assert.equal(club.recentMatches.length, 1);
  assert.equal(club.coach, 'Teknik Direktör');
  assert.deepEqual(club.squad, { total: 2, injured: 1 });
});

test('KAP tarihi İstanbul saat dilimli ISO biçimine çevrilir', () => {
  assert.equal(kapDateToIso('02.09.2026 06:02:03'), '2026-09-02T06:02:03+03:00');
});

test('yalnız kulübün futbolla ilgili KAP açıklamaları seçilir', () => {
  const records = [
    {
      publishDate: '02.09.2026 06:02:03', disclosureIndex: 1657002,
      stockCode: 'GSRAY', title: 'Transfer Görüşmeleri',
      summary: 'Profesyonel Futbolcu Test Oyuncusu Hakkında'
    },
    {
      publishDate: '01.09.2026 12:00:00', disclosureIndex: 1656000,
      stockCode: 'GSRAY', title: 'Esas Sözleşme Tadili',
      summary: 'Esas Sözleşme Tadili'
    },
    {
      publishDate: '01.09.2026 10:00:00', disclosureIndex: 1655000,
      stockCode: 'FENER', title: 'Transfer Görüşmeleri',
      summary: 'Başka kulüp bildirimi'
    }
  ];
  const html = records.map((record) =>
    ('{"disclosureBasic":' + JSON.stringify(record) + '}').replaceAll('"', '\\"')
  ).join('');
  const notices = normalizeKapDisclosures(html, CLUBS[1]);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].id, 1657002);
  assert.equal(notices[0].url, 'https://www.kap.org.tr/tr/Bildirim/1657002');
});
