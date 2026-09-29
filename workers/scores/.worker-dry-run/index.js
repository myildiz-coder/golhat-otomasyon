var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../scripts/score-normalization.js
var require_score_normalization = __commonJS({
  "../../scripts/score-normalization.js"(exports, module) {
    var TIMEZONE2 = "Europe/Istanbul";
    var TRACKED_LEAGUES2 = [
      203,
      // Super Lig
      2,
      // UEFA Champions League
      3,
      // UEFA Europa League
      848,
      // UEFA Conference League
      39,
      // Premier League
      140,
      // La Liga
      135,
      // Serie A
      78,
      // Bundesliga
      61,
      // Ligue 1
      88
      // Eredivisie
    ];
    var FOTMOB_LEAGUE_IDS = /* @__PURE__ */ new Map([
      ["TUR|super lig", 203],
      ["INT|champions league", 2],
      ["INT|europa league", 3],
      ["INT|conference league", 848],
      ["INT|europa conference league", 848],
      ["ENG|premier league", 39],
      ["ESP|laliga", 140],
      ["ESP|la liga", 140],
      ["ITA|serie a", 135],
      ["GER|bundesliga", 78],
      ["FRA|ligue 1", 61],
      ["NED|eredivisie", 88]
    ]);
    var TRACKED_SET = new Set(TRACKED_LEAGUES2);
    var LEAGUE_PRIORITY = new Map(TRACKED_LEAGUES2.map((id, index) => [id, index]));
    var LIVE_STATUSES = /* @__PURE__ */ new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);
    var FINISHED_STATUSES = /* @__PURE__ */ new Set(["FT", "AET", "PEN"]);
    var UPCOMING_STATUSES = /* @__PURE__ */ new Set(["NS", "TBD"]);
    function istanbulDateString2(value = /* @__PURE__ */ new Date()) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE2,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(value);
      const values = Object.fromEntries(
        parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
      );
      return values.year + "-" + values.month + "-" + values.day;
    }
    __name(istanbulDateString2, "istanbulDateString");
    function matchKind(status) {
      const value = String(status || "").toUpperCase();
      if (LIVE_STATUSES.has(value)) return "live";
      if (FINISHED_STATUSES.has(value)) return "finished";
      if (UPCOMING_STATUSES.has(value)) return "upcoming";
      return "other";
    }
    __name(matchKind, "matchKind");
    function apiErrors2(body2) {
      const errors = body2 && body2.errors;
      if (!errors) return [];
      if (Array.isArray(errors)) return errors.filter(Boolean).map(String);
      if (typeof errors === "object") return Object.values(errors).flat().filter(Boolean).map(String);
      return [String(errors)];
    }
    __name(apiErrors2, "apiErrors");
    function normalizeFixtures2(body2) {
      const fixtures = Array.isArray(body2 && body2.response) ? body2.response : [];
      return fixtures.filter((fixture) => TRACKED_SET.has(Number(fixture.league && fixture.league.id))).map((fixture) => {
        const leagueId = Number(fixture.league.id);
        const date = String(fixture.fixture && fixture.fixture.date || "");
        const status = String(fixture.fixture && fixture.fixture.status && fixture.fixture.status.short || "");
        return {
          id: Number(fixture.fixture && fixture.fixture.id),
          leagueId,
          league: String(fixture.league && fixture.league.name || ""),
          country: String(fixture.league && fixture.league.country || ""),
          round: String(fixture.league && fixture.league.round || ""),
          date,
          timestamp: Number(fixture.fixture && fixture.fixture.timestamp || 0),
          venue: String(fixture.fixture && fixture.fixture.venue && fixture.fixture.venue.name || ""),
          home: String(fixture.teams && fixture.teams.home && fixture.teams.home.name || ""),
          away: String(fixture.teams && fixture.teams.away && fixture.teams.away.name || ""),
          homeScore: fixture.goals && fixture.goals.home != null ? Number(fixture.goals.home) : null,
          awayScore: fixture.goals && fixture.goals.away != null ? Number(fixture.goals.away) : null,
          minute: fixture.fixture && fixture.fixture.status && fixture.fixture.status.elapsed != null ? Number(fixture.fixture.status.elapsed) : null,
          status,
          statusLong: String(fixture.fixture && fixture.fixture.status && fixture.fixture.status.long || ""),
          kind: matchKind(status)
        };
      }).filter((match) => match.id && match.date && match.home && match.away).sort((left, right) => {
        const leagueDifference = (LEAGUE_PRIORITY.get(left.leagueId) ?? 99) - (LEAGUE_PRIORITY.get(right.leagueId) ?? 99);
        return leagueDifference || left.timestamp - right.timestamp || left.id - right.id;
      });
    }
    __name(normalizeFixtures2, "normalizeFixtures");
    function normalizeFotmobMatches2(body2) {
      const leagues = Array.isArray(body2?.leagues) ? body2.leagues : [];
      const matches = [];
      for (const league of leagues) {
        const key = String(league?.ccode || "") + "|" + String(league?.name || "").toLocaleLowerCase("en-US");
        const leagueId = FOTMOB_LEAGUE_IDS.get(key);
        if (!leagueId) continue;
        for (const fixture of Array.isArray(league?.matches) ? league.matches : []) {
          const date = String(fixture?.status?.utcTime || "");
          const status = fixture?.status?.cancelled ? "PST" : fixture?.status?.finished ? "FT" : fixture?.status?.started ? "LIVE" : "NS";
          matches.push({
            id: Number(fixture?.id || 0),
            leagueId,
            league: String(league?.name || ""),
            country: String(league?.ccode || ""),
            round: String(fixture?.tournamentStage || ""),
            date,
            timestamp: Math.floor(new Date(date || 0).getTime() / 1e3),
            venue: "",
            home: String(fixture?.home?.longName || fixture?.home?.name || ""),
            away: String(fixture?.away?.longName || fixture?.away?.name || ""),
            homeScore: fixture?.home?.score == null ? null : Number(fixture.home.score),
            awayScore: fixture?.away?.score == null ? null : Number(fixture.away.score),
            minute: fixture?.status?.liveTime?.short == null ? null : Number.parseInt(fixture.status.liveTime.short, 10) || null,
            status,
            statusLong: String(fixture?.status?.reason?.long || ""),
            kind: matchKind(status)
          });
        }
      }
      return matches.filter((match) => match.id && match.date && match.home && match.away).sort((left, right) => {
        const priority = (LEAGUE_PRIORITY.get(left.leagueId) ?? 99) - (LEAGUE_PRIORITY.get(right.leagueId) ?? 99);
        return priority || left.timestamp - right.timestamp || left.id - right.id;
      });
    }
    __name(normalizeFotmobMatches2, "normalizeFotmobMatches");
    function summaryFor2(matches) {
      return matches.reduce((summary, match) => {
        summary.total += 1;
        if (match.kind === "live") summary.live += 1;
        if (match.kind === "upcoming") summary.upcoming += 1;
        if (match.kind === "finished") summary.finished += 1;
        return summary;
      }, { total: 0, live: 0, upcoming: 0, finished: 0 });
    }
    __name(summaryFor2, "summaryFor");
    module.exports = { TIMEZONE: TIMEZONE2, TRACKED_LEAGUES: TRACKED_LEAGUES2, apiErrors: apiErrors2, istanbulDateString: istanbulDateString2, matchKind, normalizeFixtures: normalizeFixtures2, normalizeFotmobMatches: normalizeFotmobMatches2, summaryFor: summaryFor2 };
  }
});

// index.mjs
var import_score_normalization = __toESM(require_score_normalization(), 1);
var { TIMEZONE, TRACKED_LEAGUES, istanbulDateString, normalizeFixtures, normalizeFotmobMatches, summaryFor, apiErrors } = import_score_normalization.default;
async function body(response) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error("provider_http");
  }
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2e6) {
        await reader.cancel();
        throw new Error("provider_size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
__name(body, "body");
async function refreshScores(env, fetcher = fetch, now = /* @__PURE__ */ new Date()) {
  if (env.SCORES_ENABLED !== "true") return { status: "disabled" };
  const db = env.SCORES_DB, owner = crypto.randomUUID(), at = now.toISOString(), day = istanbulDateString(now), utc = at.slice(0, 10);
  const lease = await db.prepare(`INSERT INTO score_leases(id,owner,expires) VALUES ('refresh',?,?)
 ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE expires<? RETURNING owner`).bind(owner, now.getTime() + 12e4, now.getTime()).first();
  if (!lease) return { status: "busy" };
  let provider = "FotMob", matches = null, degraded = true;
  try {
    if (env.API_FOOTBALL_KEY) {
      const configured = Number(env.API_FOOTBALL_DAILY_LIMIT || 90), cap = Number.isInteger(configured) && configured >= 0 ? Math.min(90, configured) : 0;
      const credit = cap > 0 ? await db.prepare(`INSERT INTO score_provider_budget(day,calls) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET calls=calls+1 WHERE calls<? RETURNING calls`).bind(utc, cap).first() : null;
      if (credit) {
        try {
          const data = await body(await fetcher("https://v3.football.api-sports.io/fixtures?" + new URLSearchParams({ date: day, timezone: TIMEZONE }), { headers: { "x-apisports-key": env.API_FOOTBALL_KEY }, redirect: "error", signal: AbortSignal.timeout(12e3) }));
          if (!Array.isArray(data.response) || apiErrors(data).length) throw new Error("invalid_primary");
          matches = normalizeFixtures(data);
          provider = "API-Football";
          degraded = false;
        } catch {
        }
      }
    }
    if (matches === null) {
      const data = await body(await fetcher("https://www.fotmob.com/api/data/matches?" + new URLSearchParams({ date: day.replaceAll("-", ""), ccode3: "TUR", timezone: TIMEZONE }), { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(12e3) }));
      if (!Array.isArray(data.leagues) || String(data.date).replaceAll("-", "") !== day.replaceAll("-", "")) throw new Error("invalid_fallback");
      if (data.leagues.some((l) => !Array.isArray(l.matches))) throw new Error("invalid_fallback");
      matches = normalizeFotmobMatches(data);
    }
    const payload = { updatedAt: at, source: provider, sourceUrl: provider === "FotMob" ? "https://www.fotmob.com/" : "https://www.api-football.com/", providerChain: ["API-Football", "FotMob"], degraded, date: day, timezone: TIMEZONE, trackedLeagues: TRACKED_LEAGUES, summary: summaryFor(matches), matches };
    await db.batch([
      db.prepare(`INSERT INTO score_snapshots(day,payload,fetched_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM score_leases WHERE id='refresh' AND owner=?)
   ON CONFLICT(day) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at WHERE excluded.fetched_at>fetched_at`).bind(day, JSON.stringify(payload), at, owner),
      db.prepare("INSERT INTO score_attempts(id,attempted_at,status,provider) VALUES (?,?,?,?)").bind(owner, at, "ok", provider),
      db.prepare("DELETE FROM score_attempts WHERE attempted_at<?").bind(new Date(now.getTime() - 7 * 864e5).toISOString())
    ]);
    return { status: "ok", matches: matches.length };
  } catch {
    await db.prepare("INSERT INTO score_attempts(id,attempted_at,status,error_code) VALUES (?,?,?,?)").bind(owner, at, "failed", "provider_unavailable").run();
    return { status: "failed" };
  } finally {
    await db.prepare("DELETE FROM score_leases WHERE id='refresh' AND owner=?").bind(owner).run();
  }
}
__name(refreshScores, "refreshScores");
var index_default = {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(refreshScores(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/scores") return new Response("Not found", { status: 404 });
    if (env.SCORES_ENABLED !== "true") return Response.json({ error: "disabled" }, { status: 503 });
    const day = istanbulDateString(), snapshot = await env.SCORES_DB.prepare("SELECT payload FROM score_snapshots WHERE day=?").bind(day).first();
    if (!snapshot) return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return new Response(snapshot.payload, { headers: { "Content-Type": "application/json", "Cache-Control": "public,max-age=0,s-maxage=30", "X-Content-Type-Options": "nosniff" } });
  }
};
export {
  index_default as default,
  refreshScores
};
//# sourceMappingURL=index.js.map
