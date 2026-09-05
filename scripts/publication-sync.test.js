'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { syncPublication, SYNC_URL } = require('./publication-sync');
const { standingsChanged } = require('./standings-change');
const ready = { ok: true, storageReady: true, sourceReady: true, articles: 42 };

test('archive delivery uses the canonical host and requires a verified persistent result', async () => {
  const result = await syncPublication({ fetcher: async (url, options) => {
    assert.equal(url, 'https://golhat.com/api/golhat/sync');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined);
    return Response.json(ready);
  } });
  assert.equal(result.articles, 42);
  assert.equal(new URL(SYNC_URL).hostname, 'golhat.com');
});

test('a redirect, HTML success page or incomplete import cannot be reported as a successful delivery', async () => {
  for (const response of [new Response('', { status: 308 }), new Response('<html>redirect</html>'), Response.json({ ...ready, sourceReady: false }), Response.json({ ...ready, storageReady: false }), Response.json({ ...ready, articles: 0 })]) {
    await assert.rejects(syncPublication({ attempts: 1, fetcher: async () => response }));
  }
});

test('transient delivery failures retry and a permanent outage remains a failure', async () => {
  let calls = 0;
  await syncPublication({ sleep: async () => {}, fetcher: async () => ++calls < 3 ? new Response('', { status: 503 }) : Response.json(ready) });
  assert.equal(calls, 3);
  await assert.rejects(syncPublication({ sleep: async () => {}, fetcher: async () => new Response('', { status: 503 }) }), /503/);
});

const table = { updatedAt: '2026-09-05T10:00:00Z', season: 2026, round: '4. Hafta', standings: [{ rank: 1, team: 'A', points: 10 }, { rank: 2, team: 'B', points: 7 }], fixtures: [{ home: 'A', away: 'B', date: '2026-09-06' }] };
test('refresh timestamps and equivalent ordering do not dispatch the match desk', () => {
  assert.equal(standingsChanged(table, { ...table, updatedAt: '2026-09-05T10:05:00Z', standings: [...table.standings].reverse() }), false);
});
test('real points, fixtures and season changes dispatch the match desk; broken feeds do not', () => {
  assert.equal(standingsChanged(table, { ...table, standings: [{ ...table.standings[0], points: 13 }, table.standings[1]] }), true);
  assert.equal(standingsChanged(table, { ...table, fixtures: [{ ...table.fixtures[0], date: '2026-09-07' }] }), true);
  assert.equal(standingsChanged(table, { ...table, season: 2027 }), true);
  assert.equal(standingsChanged(null, table), true);
  assert.throws(() => standingsChanged(table, { standings: [] }), /geçersiz/);
});
