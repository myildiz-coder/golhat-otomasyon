// GOLHAT — Canlı skor çekme scripti (API-Football)
// Sadece takip edilen liglerdeki CANLI maçları çeker; veri yoksa boş liste yazar.
// Kaynak: https://v3.football.api-sports.io/fixtures?live=all

const fs = require('fs');

// Süper Lig, UEFA kupaları ve büyük Avrupa ligleri
const TRACKED_LEAGUES = new Set([
  203, // Süper Lig
  2,   // UEFA Şampiyonlar Ligi
  3,   // UEFA Avrupa Ligi
  848, // UEFA Konferans Ligi
  39,  // Premier Lig
  140, // La Liga
  135, // Serie A
  78,  // Bundesliga
  61   // Ligue 1
]);

async function main() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error('API_FOOTBALL_KEY bulunamadı — GitHub Secrets kontrol edin.');
  }

  const res = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
    headers: { 'x-apisports-key': key }
  });

  if (!res.ok) {
    throw new Error(`API-Football isteği başarısız: ${res.status} ${res.statusText}`);
  }

  const body = await res.json();
  const fixtures = Array.isArray(body.response) ? body.response : [];

  const matches = fixtures
    .filter((f) => TRACKED_LEAGUES.has(f.league?.id))
    .map((f) => ({
      leagueId: f.league.id,
      league: f.league.name,
      home: f.teams.home.name,
      away: f.teams.away.name,
      homeScore: f.goals.home,
      awayScore: f.goals.away,
      minute: f.fixture.status.elapsed,
      status: f.fixture.status.short // örn: 1H, 2H, HT, FT
    }));

  const output = {
    updatedAt: new Date().toISOString(),
    source: 'API-Football',
    matches
  };

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/canli-skorlar.json', JSON.stringify(output, null, 2) + '\n');

  console.log(`Yazıldı: ${matches.length} canlı maç (${TRACKED_LEAGUES.size} lig takip ediliyor).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
