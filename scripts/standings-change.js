'use strict';

// Refresh timestamps prove the feed was checked; they are not a football event.
function standingsSignature(value) {
  if (!value || !Array.isArray(value.standings) || !value.standings.length || !Array.isArray(value.fixtures)) return null;
  return JSON.stringify({
    season: value.season, round: value.round,
    standings: [...value.standings].sort((a, b) => a.rank - b.rank),
    fixtures: [...value.fixtures].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  });
}
function standingsChanged(previous, next) {
  const incoming = standingsSignature(next);
  if (!incoming) throw new Error('Yeni puan verisi geçersiz');
  return standingsSignature(previous) !== incoming;
}
module.exports = { standingsChanged };
