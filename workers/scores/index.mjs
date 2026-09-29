import normalizers from '../../scripts/score-normalization.js';
const {TIMEZONE,TRACKED_LEAGUES,istanbulDateString,normalizeFixtures,normalizeFotmobMatches,summaryFor,apiErrors}=normalizers;
async function body(response){
 if(!response.ok||!response.body){await response.body?.cancel();throw new Error('provider_http');}
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();throw new Error('provider_size');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export async function refreshScores(env,fetcher=fetch,now=new Date()){
 if(env.SCORES_ENABLED!=='true')return {status:'disabled'};
 const db=env.SCORES_DB,owner=crypto.randomUUID(),at=now.toISOString(),day=istanbulDateString(now),utc=at.slice(0,10);
 const lease=await db.prepare(`INSERT INTO score_leases(id,owner,expires) VALUES ('refresh',?,?)
 ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE expires<? RETURNING owner`).bind(owner,now.getTime()+120000,now.getTime()).first();
 if(!lease)return {status:'busy'};
 let provider='FotMob',matches=null,degraded=true;
 try{
  if(env.API_FOOTBALL_KEY){
   const configured=Number(env.API_FOOTBALL_DAILY_LIMIT||90),cap=Number.isInteger(configured)&&configured>=0?Math.min(90,configured):0;
   const credit=cap>0?await db.prepare(`INSERT INTO score_provider_budget(day,calls) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET calls=calls+1 WHERE calls<? RETURNING calls`).bind(utc,cap).first():null;
   if(credit){try{
    const data=await body(await fetcher('https://v3.football.api-sports.io/fixtures?'+new URLSearchParams({date:day,timezone:TIMEZONE}),{headers:{'x-apisports-key':env.API_FOOTBALL_KEY},redirect:'error',signal:AbortSignal.timeout(12000)}));
    if(!Array.isArray(data.response)||apiErrors(data).length)throw new Error('invalid_primary');
    matches=normalizeFixtures(data);provider='API-Football';degraded=false;
   }catch{ /* fallback, no provider error text or secret is logged */ }}
  }
  if(matches===null){
   const data=await body(await fetcher('https://www.fotmob.com/api/data/matches?'+new URLSearchParams({date:day.replaceAll('-',''),ccode3:'TUR',timezone:TIMEZONE}),{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)}));
   if(!Array.isArray(data.leagues)||String(data.date).replaceAll('-','')!==day.replaceAll('-',''))throw new Error('invalid_fallback');
   if(data.leagues.some(l=>!Array.isArray(l.matches)))throw new Error('invalid_fallback');
   matches=normalizeFotmobMatches(data);
  }
  const payload={updatedAt:at,source:provider,sourceUrl:provider==='FotMob'?'https://www.fotmob.com/':'https://www.api-football.com/',providerChain:['API-Football','FotMob'],degraded,date:day,timezone:TIMEZONE,trackedLeagues:TRACKED_LEAGUES,summary:summaryFor(matches),matches};
  // CAS guards against a delayed invocation overwriting a newer snapshot.
  await db.batch([
   db.prepare(`INSERT INTO score_snapshots(day,payload,fetched_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM score_leases WHERE id='refresh' AND owner=?)
   ON CONFLICT(day) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at WHERE excluded.fetched_at>fetched_at`).bind(day,JSON.stringify(payload),at,owner),
   db.prepare('INSERT INTO score_attempts(id,attempted_at,status,provider) VALUES (?,?,?,?)').bind(owner,at,'ok',provider),
   db.prepare("DELETE FROM score_attempts WHERE attempted_at<?").bind(new Date(now.getTime()-7*86400000).toISOString()),
  ]);
  return {status:'ok',matches:matches.length};
 }catch{
  // Leave the last successful snapshot and its true timestamp intact.
  await db.prepare('INSERT INTO score_attempts(id,attempted_at,status,error_code) VALUES (?,?,?,?)').bind(owner,at,'failed','provider_unavailable').run();
  return {status:'failed'};
 }finally{await db.prepare("DELETE FROM score_leases WHERE id='refresh' AND owner=?").bind(owner).run();}
}
export default {
 async scheduled(controller,env,ctx){ctx.waitUntil(refreshScores(env));},
 async fetch(request,env){
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/scores')return new Response('Not found',{status:404});
  if(env.SCORES_ENABLED!=='true')return Response.json({error:'disabled'},{status:503});
  const day=istanbulDateString(),snapshot=await env.SCORES_DB.prepare('SELECT payload FROM score_snapshots WHERE day=?').bind(day).first();
  if(!snapshot)return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  return new Response(snapshot.payload,{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=0,s-maxage=30','X-Content-Type-Options':'nosniff'}});
 }
};
