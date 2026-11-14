const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),path=require('node:path');
function binding(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(__dirname,'../workers/scores/migrations/0001_scores.sql'),'utf8'));return {db,prepare(q){const s=db.prepare(q);let args=[];return {bind(...v){args=v;return this},async first(){return s.get(...args)||null},async run(){const r=s.run(...args);return {meta:{changes:r.changes}}}}},async batch(list){db.exec('BEGIN');try{for(const s of list)await s.run();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}};}
test('cron preserves real empty success, failure timestamp and last good snapshot',async()=>{
 const {refreshScores}=await import('../workers/scores/index.mjs');const db=binding(),env={SCORES_DB:db,SCORES_ENABLED:'true'},now=new Date('2026-09-29T12:00:00Z');
 const empty=async()=>Response.json({date:'20260929',leagues:[]});
 assert.equal((await refreshScores(env,empty,now)).status,'ok');
 const previous=db.db.prepare('SELECT * FROM score_snapshots').get();assert.equal(JSON.parse(previous.payload).summary.total,0);
 assert.equal((await refreshScores(env,async()=>Response.json({unexpected:[]}),new Date(now.getTime()+180000))).status,'failed');
 assert.deepEqual(db.db.prepare('SELECT * FROM score_snapshots').get(),previous);db.db.close();
});
test('disabled cron and lease contention make no upstream requests',async()=>{
 const {refreshScores}=await import('../workers/scores/index.mjs');const db=binding(),now=new Date();let calls=0;const provider=async()=>{calls++;return Response.json({});};
 assert.equal((await refreshScores({SCORES_DB:db,SCORES_ENABLED:'false'},provider,now)).status,'disabled');
 db.db.prepare('INSERT INTO score_leases VALUES (?,?,?)').run('refresh','other',now.getTime()+60000);
 assert.equal((await refreshScores({SCORES_DB:db,SCORES_ENABLED:'true'},provider,now)).status,'busy');assert.equal(calls,0);db.db.close();
});
test('primary budget exhaustion falls back, response date mismatch fails closed',async()=>{
 const {refreshScores}=await import('../workers/scores/index.mjs');const db=binding(),env={SCORES_DB:db,SCORES_ENABLED:'true',API_FOOTBALL_KEY:'test-placeholder',API_FOOTBALL_DAILY_LIMIT:'1'},now=new Date('2026-09-29T12:00:00Z');
 db.db.prepare('INSERT INTO score_provider_budget VALUES (?,?)').run('2026-09-29',1);
 let calls=0;const result=await refreshScores(env,async url=>{calls++;assert.ok(url.startsWith('https://www.fotmob.com/'));return Response.json({date:'20260928',leagues:[]});},now);
 assert.equal(result.status,'failed');assert.equal(calls,1);assert.equal(db.db.prepare('SELECT count(*) AS n FROM score_snapshots').get().n,0);db.db.close();
});
