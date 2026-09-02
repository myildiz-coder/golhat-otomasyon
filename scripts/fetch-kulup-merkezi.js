'use strict';

const fs = require('node:fs');
const path = require('node:path');
const DATA_ROOT = 'https://www.fotmob.com/api/data/teams';
const KAP_ROOT = 'https://www.kap.org.tr/tr/bildirim-sorgu-sonuc';
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'kulup-merkezi.json');
const TIMEZONE = 'Europe/Istanbul';
const CLUBS = [
  {
    key: 'fenerbahce', id: 8695, name: 'Fenerbahçe', ticker: 'FENER',
    kapMemberId: '4028e4a240e95dc90140ede7351a013d',
    officialUrl: 'https://www.fenerbahce.org/haberler/futbol'
  },
  {
    key: 'galatasaray', id: 8637, name: 'Galatasaray', ticker: 'GSRAY',
    kapMemberId: '4028e4a14203278a0142095598f114ba',
    officialUrl: 'https://www.galatasaray.org/haberler/futbol/43'
  },
  {
    key: 'besiktas', id: 10188, name: 'Beşiktaş', ticker: 'BJKAS',
    kapMemberId: '4028e4a241a25fcb0141a276cda10189',
    officialUrl: 'https://bjk.com.tr/tr/haber_listesi/1'
  },
  {
    key: 'trabzonspor', id: 9752, name: 'Trabzonspor', ticker: 'TSPOR',
    kapMemberId: '4028e4a141da49e50141e0852f272b80',
    officialUrl: 'https://www.trabzonspor.org.tr/tr/haberler?team=trabzonspor'
  }
];

function matchKind(status) {
  if (status?.finished) return 'finished';
  if (status?.started && !status?.cancelled) return 'live';
  if (status?.cancelled) return 'postponed';
  return 'upcoming';
}

function normalizeMatch(fixture, clubId) {
  const date = String(fixture?.status?.utcTime || '');
  const kind = matchKind(fixture?.status);
  const homeScore = fixture?.home?.score;
  const awayScore = fixture?.away?.score;
  let result = '';
  if (kind === 'finished' && homeScore != null && awayScore != null) {
    const home = Number(fixture?.home?.id) === Number(clubId);
    const ours = Number(home ? homeScore : awayScore);
    const theirs = Number(home ? awayScore : homeScore);
    result = ours > theirs ? 'W' : ours < theirs ? 'L' : 'D';
  }
  return {
    id: Number(fixture?.id || 0), date,
    timestamp: Math.floor(new Date(date || 0).getTime() / 1000),
    tournament: String(fixture?.tournament?.name || ''),
    stage: String(fixture?.tournament?.stage || ''),
    home: String(fixture?.home?.name || ''), away: String(fixture?.away?.name || ''),
    homeScore: homeScore == null ? null : Number(homeScore),
    awayScore: awayScore == null ? null : Number(awayScore),
    status: String(fixture?.status?.reason?.short || ''), kind, result
  };
}

function normalizeClub(body, config) {
  const fixtures = Array.isArray(body?.fixtures?.allFixtures?.fixtures)
    ? body.fixtures.allFixtures.fixtures : [];
  const matches = fixtures.map((item) => normalizeMatch(item, config.id))
    .filter((item) => item.id && item.date && item.home && item.away);
  const nextMatches = matches.filter((item) => ['upcoming', 'live'].includes(item.kind))
    .sort((a, b) => a.timestamp - b.timestamp).slice(0, 6);
  const recentMatches = matches.filter((item) => item.kind === 'finished')
    .sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  const groups = Array.isArray(body?.squad?.squad) ? body.squad.squad : [];
  const coach = groups.find((group) => group?.title === 'coach')?.members?.[0]?.name || '';
  const players = groups.filter((group) => group?.title !== 'coach')
    .flatMap((group) => Array.isArray(group?.members) ? group.members : []);
  const location = body?.details?.sportsTeamJSONLD?.location || {};
  return {
    id: config.id, name: String(body?.details?.name || config.name),
    season: String(body?.details?.latestSeason || ''),
    league: String(body?.details?.primaryLeagueName || 'Super Lig'),
    coach: String(coach), stadium: String(location?.name || ''),
    squad: { total: players.length, injured: players.filter((player) => Boolean(player?.injury)).length },
    nextMatches, recentMatches, officialUrl: config.officialUrl,
    sourceUrl: 'https://www.fotmob.com/teams/' + config.id + '/overview/' +
      String(body?.details?.seopath || config.key)
  };
}

function extractDisclosureBasics(html) {
  const text = String(html || '').replaceAll('\\"', '"');
  const marker = '{"disclosureBasic":';
  const items = [];
  let cursor = 0;
  while ((cursor = text.indexOf(marker, cursor)) !== -1) {
    const start = text.indexOf('{', cursor + marker.length);
    if (start === -1) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
      } else if (character === '"') {
        inString = true;
      } else if (character === '{') {
        depth += 1;
      } else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }
    if (end === -1) break;
    try {
      items.push(JSON.parse(text.slice(start, end)));
    } catch (error) {
      console.warn('KAP bildirim kaydı ayrıştırılamadı:', error.message);
    }
    cursor = end;
  }
  return items;
}

function kapDateToIso(value) {
  const match = String(value || '').match(
    /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return '';
  return match[3] + '-' + match[2] + '-' + match[1] + 'T' +
    match[4] + ':' + match[5] + ':' + (match[6] || '00') + '+03:00';
}

function normalizeKapDisclosures(html, config) {
  const footballTerms =
    /futbol|futbolcu|transfer|bonservis|kiralık|fesih|teknik yönetim|teknik direktör|oyuncu|sportif/i;
  const unique = new Map();
  for (const item of extractDisclosureBasics(html)) {
    const id = Number(item?.disclosureIndex || 0);
    const searchable = String(item?.title || '') + ' ' + String(item?.summary || '');
    if (!id || String(item?.stockCode || '') !== config.ticker ||
        /esas sözleşme/i.test(searchable) || !footballTerms.test(searchable)) {
      continue;
    }
    unique.set(id, {
      id,
      date: kapDateToIso(item.publishDate),
      type: String(item.title || 'KAP Açıklaması'),
      summary: String(item.summary || item.title || 'KAP Açıklaması'),
      url: 'https://www.kap.org.tr/tr/Bildirim/' + id
    });
  }
  return Array.from(unique.values())
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))
    .slice(0, 6);
}
async function fetchClub(config) {
  const query = new URLSearchParams({ id: String(config.id), ccode3: 'TUR', timezone: TIMEZONE });
  const response = await fetch(DATA_ROOT + '?' + query, {
    headers: { accept: 'application/json', 'user-agent': 'GOLHAT/1.0 (+https://golhat.com)' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(config.name + ' veri isteği başarısız: HTTP ' + response.status);
  return response.json();
}
async function fetchKap(config) {
  const query = new URLSearchParams({ member: config.kapMemberId });
  const url = KAP_ROOT + '?' + query;
  const response = await fetch(url, {
    headers: { accept: 'text/html', 'user-agent': 'GOLHAT/1.0 (+https://golhat.com)' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(config.name + ' KAP isteği başarısız: HTTP ' + response.status);
  return {
    ticker: config.ticker,
    queryUrl: url,
    disclosures: normalizeKapDisclosures(await response.text(), config)
  };
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}

async function main() {
  const clubs = {};
  for (const config of CLUBS) {
    const [teamBody, kap] = await Promise.all([
      fetchClub(config),
      fetchKap(config).catch((error) => {
        console.warn(error.message);
        return { ticker: config.ticker, queryUrl: KAP_ROOT + '?member=' + config.kapMemberId, disclosures: [] };
      })
    ]);
    clubs[config.key] = { ...normalizeClub(teamBody, config), kap };
    console.log(config.name + ': ' + clubs[config.key].nextMatches.length +
      ' sıradaki maç, ' + clubs[config.key].recentMatches.length + ' son maç, ' +
      kap.disclosures.length + ' futbol KAP bildirimi.');
  }
  writeJsonAtomic(OUTPUT_PATH, {
    updatedAt: new Date().toISOString(),
    sources: [
      { name: 'FotMob', url: 'https://www.fotmob.com/' },
      { name: 'KAP', url: 'https://www.kap.org.tr/' }
    ],
    timezone: TIMEZONE,
    clubs
  });
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });
module.exports = {
  CLUBS, extractDisclosureBasics, kapDateToIso, matchKind,
  normalizeClub, normalizeKapDisclosures, normalizeMatch
};
