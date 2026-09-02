'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TFF_URL = 'https://www.tff.org/default.aspx?pageID=198';
const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'super-lig.json');

function decodeEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function textContent(value) {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function capture(row, suffix) {
  const pattern = new RegExp('id="[^"]*_' + suffix + '"[^>]*>([\\s\\S]*?)<\\/span>', 'i');
  const match = row.match(pattern);
  return match ? textContent(match[1]) : '';
}

function parseSeason(html) {
  const match = html.match(/Trendyol\s+S\u00fcper\s+Lig\s+(\d{4})-(\d{4})\s+Sezonu\s+Puan\s+Cetveli/i);
  if (!match) throw new Error('TFF sayfasinda sezon bilgisi bulunamadi');
  const season = Number(match[1]);
  return { season, seasonLabel: season + '/' + match[2].slice(-2) };
}

function parseStandings(html) {
  const tableMarker = html.match(/<table\s+class="s-table"/i);
  if (!tableMarker) throw new Error('TFF puan cetveli tablosu bulunamadi');
  const tableEnd = html.indexOf('</table>', tableMarker.index);
  const tableHtml = html.slice(tableMarker.index, tableEnd > tableMarker.index ? tableEnd + 8 : undefined);
  const rows = tableHtml.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const standings = [];

  for (const row of rows) {
    if (!row.includes('_lnkTakim')) continue;
    const teamMatch = row.match(/_lnkTakim"[^>]*>([\s\S]*?)<\/a>/i);
    if (!teamMatch) continue;

    const rankedTeam = textContent(teamMatch[1]).match(/^(\d+)\.\s*(.+)$/);
    const values = [...row.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)]
      .map((match) => textContent(match[1]))
      .filter((value) => /^-?\d+$/.test(value))
      .map(Number);

    if (!rankedTeam || values.length < 8) continue;
    standings.push({
      rank: Number(rankedTeam[1]),
      team: rankedTeam[2],
      played: values[0],
      won: values[1],
      drawn: values[2],
      lost: values[3],
      goalsFor: values[4],
      goalsAgainst: values[5],
      goalDifference: values[6],
      points: values[7],
      form: ''
    });
  }

  if (standings.length < 10) {
    throw new Error('TFF puan cetveli eksik ayristirildi: ' + standings.length + ' takim');
  }
  return standings;
}

function fixtureDateIso(dateValue, timeValue) {
  const dateMatch = String(dateValue || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const timeMatch = String(timeValue || '').match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return '';

  const [, day, month, year] = dateMatch;
  const [, hour, minute] = timeMatch;
  return new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 3,
    Number(minute)
  )).toISOString();
}

function activeFixtureWeek(html, fixtureStart) {
  const header = html.slice(0, fixtureStart);
  const matches = [...header.matchAll(/class=haftaNoActive[^>]*>[\s\S]*?<a[^>]*>\s*(\d+)\s*<\/a>/gi)];
  if (!matches.length) throw new Error('TFF sayfasinda aktif fikstur haftasi bulunamadi');
  return Number(matches.at(-1)[1]);
}

function parseFixtures(html) {
  const fixtureMarker = html.match(/<table\s+id="[^"]*_dtlHaftaninMaclari"/i);
  if (!fixtureMarker) throw new Error('TFF sayfasinda haftanin maclari tablosu bulunamadi');

  const fixtureStart = fixtureMarker.index;
  const standingsStart = html.indexOf('Sezonu Puan Cetveli', fixtureStart);
  const fixtureHtml = html.slice(fixtureStart, standingsStart > fixtureStart ? standingsStart : undefined);
  const week = activeFixtureWeek(html, fixtureStart);
  const rows = fixtureHtml.match(/<tr\b[^>]*class="haftaninMaclariTr"[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const fixtures = [];

  for (const row of rows) {
    const dateText = capture(row, 'lblTarih');
    const timeText = capture(row, 'lblSaat');
    const home = capture(row, 'Label4');
    const away = capture(row, 'Label1');
    const homeScore = capture(row, 'Label5');
    const awayScore = capture(row, 'Label6');
    const date = fixtureDateIso(dateText, timeText);
    const matchId = row.match(/macId=(\d+)/i);

    if (!date || !home || !away || homeScore || awayScore) continue;
    fixtures.push({
      id: matchId ? Number(matchId[1]) : Number(String(date).replace(/\D/g, '').slice(0, 14)),
      date,
      timestamp: Math.floor(new Date(date).getTime() / 1000),
      round: week + '. Hafta',
      status: 'NS',
      statusLong: 'Baslamadi',
      venue: '',
      home,
      away
    });
  }

  fixtures.sort((left, right) => left.timestamp - right.timestamp);
  if (!fixtures.length) throw new Error('TFF sayfasinda aktif haftanin oynanacak maci bulunamadi');
  return { week, fixtures };
}

function parseTffPage(html) {
  const season = parseSeason(html);
  const fixtureData = parseFixtures(html);
  return {
    source: 'Turkiye Futbol Federasyonu (TFF)',
    sourceUrl: TFF_URL,
    leagueId: 'TFF-SUPER-LIG',
    season: season.season,
    seasonLabel: season.seasonLabel,
    round: fixtureData.week + '. Hafta',
    roundLabel: fixtureData.week + '. Hafta',
    standings: parseStandings(html),
    fixtures: fixtureData.fixtures
  };
}

async function fetchTffPage() {
  const response = await fetch(TFF_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'GOLHAT/1.0 (+https://golhat.com)'
    }
  });
  if (!response.ok) throw new Error('TFF istegi basarisiz: HTTP ' + response.status);
  const bytes = await response.arrayBuffer();
  return new TextDecoder('windows-1254').decode(bytes);
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}

async function main() {
  const html = await fetchTffPage();
  const output = { updatedAt: new Date().toISOString(), ...parseTffPage(html) };
  writeJsonAtomic(OUTPUT_PATH, output);
  console.log(
    'TFF Super Lig verisi yazildi: ' + output.standings.length +
    ' takim, ' + output.fixtures.length + ' oynanacak mac, ' + output.roundLabel
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  decodeEntities,
  fixtureDateIso,
  parseFixtures,
  parseSeason,
  parseStandings,
  parseTffPage
};
