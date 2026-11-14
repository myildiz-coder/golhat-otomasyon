const TIMEZONE = 'Europe/Istanbul';
const TRACKED_LEAGUES = [
  203, // Super Lig
  2,   // UEFA Champions League
  3,   // UEFA Europa League
  848, // UEFA Conference League
  39,  // Premier League
  140, // La Liga
  135, // Serie A
  78,  // Bundesliga
  61,  // Ligue 1
  88   // Eredivisie
];
const FOTMOB_LEAGUE_IDS = new Map([
  ['TUR|super lig', 203],
  ['INT|champions league', 2],
  ['INT|europa league', 3],
  ['INT|conference league', 848],
  ['INT|europa conference league', 848],
  ['ENG|premier league', 39],
  ['ESP|laliga', 140],
  ['ESP|la liga', 140],
  ['ITA|serie a', 135],
  ['GER|bundesliga', 78],
  ['FRA|ligue 1', 61],
  ['NED|eredivisie', 88]
]);
const TRACKED_SET = new Set(TRACKED_LEAGUES);
const LEAGUE_PRIORITY = new Map(TRACKED_LEAGUES.map((id, index) => [id, index]));
const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE']);
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
const UPCOMING_STATUSES = new Set(['NS', 'TBD']);

function istanbulDateString(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );
  return values.year + '-' + values.month + '-' + values.day;
}

function matchKind(status) {
  const value = String(status || '').toUpperCase();
  if (LIVE_STATUSES.has(value)) return 'live';
  if (FINISHED_STATUSES.has(value)) return 'finished';
  if (UPCOMING_STATUSES.has(value)) return 'upcoming';
  return 'other';
}

function apiErrors(body) {
  const errors = body && body.errors;
  if (!errors) return [];
  if (Array.isArray(errors)) return errors.filter(Boolean).map(String);
  if (typeof errors === 'object') return Object.values(errors).flat().filter(Boolean).map(String);
  return [String(errors)];
}

function normalizeFixtures(body) {
  const fixtures = Array.isArray(body && body.response) ? body.response : [];

  return fixtures
    .filter((fixture) => TRACKED_SET.has(Number(fixture.league && fixture.league.id)))
    .map((fixture) => {
      const leagueId = Number(fixture.league.id);
      const date = String(fixture.fixture && fixture.fixture.date || '');
      const status = String(fixture.fixture && fixture.fixture.status && fixture.fixture.status.short || '');
      return {
        id: Number(fixture.fixture && fixture.fixture.id),
        leagueId,
        league: String(fixture.league && fixture.league.name || ''),
        country: String(fixture.league && fixture.league.country || ''),
        round: String(fixture.league && fixture.league.round || ''),
        date,
        timestamp: Number(fixture.fixture && fixture.fixture.timestamp || 0),
        venue: String(fixture.fixture && fixture.fixture.venue && fixture.fixture.venue.name || ''),
        home: String(fixture.teams && fixture.teams.home && fixture.teams.home.name || ''),
        away: String(fixture.teams && fixture.teams.away && fixture.teams.away.name || ''),
        homeScore: fixture.goals && fixture.goals.home != null ? Number(fixture.goals.home) : null,
        awayScore: fixture.goals && fixture.goals.away != null ? Number(fixture.goals.away) : null,
        minute: fixture.fixture && fixture.fixture.status && fixture.fixture.status.elapsed != null
          ? Number(fixture.fixture.status.elapsed)
          : null,
        status,
        statusLong: String(fixture.fixture && fixture.fixture.status && fixture.fixture.status.long || ''),
        kind: matchKind(status)
      };
    })
    .filter((match) => match.id && match.date && match.home && match.away)
    .sort((left, right) => {
      const leagueDifference =
        (LEAGUE_PRIORITY.get(left.leagueId) ?? 99) - (LEAGUE_PRIORITY.get(right.leagueId) ?? 99);
      return leagueDifference || left.timestamp - right.timestamp || left.id - right.id;
    });
}

function normalizeFotmobMatches(body) {
  const leagues = Array.isArray(body?.leagues) ? body.leagues : [];
  const matches = [];
  for (const league of leagues) {
    const key = String(league?.ccode || '') + '|' +
      String(league?.name || '').toLocaleLowerCase('en-US');
    const leagueId = FOTMOB_LEAGUE_IDS.get(key);
    if (!leagueId) continue;
    for (const fixture of Array.isArray(league?.matches) ? league.matches : []) {
      const date = String(fixture?.status?.utcTime || '');
      const status = fixture?.status?.cancelled ? 'PST'
        : fixture?.status?.finished ? 'FT'
          : fixture?.status?.started ? 'LIVE' : 'NS';
      matches.push({
        id: Number(fixture?.id || 0),
        leagueId,
        league: String(league?.name || ''),
        country: String(league?.ccode || ''),
        round: String(fixture?.tournamentStage || ''),
        date,
        timestamp: Math.floor(new Date(date || 0).getTime() / 1000),
        venue: '',
        home: String(fixture?.home?.longName || fixture?.home?.name || ''),
        away: String(fixture?.away?.longName || fixture?.away?.name || ''),
        homeScore: fixture?.home?.score == null ? null : Number(fixture.home.score),
        awayScore: fixture?.away?.score == null ? null : Number(fixture.away.score),
        minute: fixture?.status?.liveTime?.short == null
          ? null : Number.parseInt(fixture.status.liveTime.short, 10) || null,
        status,
        statusLong: String(fixture?.status?.reason?.long || ''),
        kind: matchKind(status)
      });
    }
  }
  return matches
    .filter((match) => match.id && match.date && match.home && match.away)
    .sort((left, right) => {
      const priority = (LEAGUE_PRIORITY.get(left.leagueId) ?? 99) -
        (LEAGUE_PRIORITY.get(right.leagueId) ?? 99);
      return priority || left.timestamp - right.timestamp || left.id - right.id;
    });
}

function summaryFor(matches) {
  return matches.reduce((summary, match) => {
    summary.total += 1;
    if (match.kind === 'live') summary.live += 1;
    if (match.kind === 'upcoming') summary.upcoming += 1;
    if (match.kind === 'finished') summary.finished += 1;
    return summary;
  }, { total: 0, live: 0, upcoming: 0, finished: 0 });
}


module.exports={TIMEZONE,TRACKED_LEAGUES,apiErrors,istanbulDateString,matchKind,normalizeFixtures,normalizeFotmobMatches,summaryFor};
