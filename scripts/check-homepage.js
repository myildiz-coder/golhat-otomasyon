'use strict';

const {
  loadState,
  writeHomepageArchive,
  writeHomepage
} = require('./editorial-lib');

function main() {
  const state = loadState();
  const story = state.stories.find((item) => item.id === state.homepage.storyId);
  if (!story) {
    throw new Error('Ana sayfada kayıtlı manşet haberi editoryal durumda bulunamadı');
  }

  const lastChange = [...state.homepage.changes]
    .reverse()
    .find((change) => change.storyId === story.id);
  const publishedAt = new Date(
    lastChange?.at || story.discoveredAt || story.publishedAt
  );
  if (Number.isNaN(publishedAt.getTime())) {
    throw new Error('Ana sayfa manşet zamanı geçersiz');
  }

  const changed = writeHomepage(story, publishedAt);
  const archiveChanged = writeHomepageArchive(story, publishedAt);
  console.log(
    changed
      ? '[Ana Sayfa Bütünlük] Kopukluk bulundu ve tüm manşet dosyası yeniden kuruldu.'
      : '[Ana Sayfa Bütünlük] Manşet, analiz, kaynaklar ve karar aynı habere bağlı.'
  );
  if (archiveChanged) {
    console.log('[Ana Sayfa Bütünlük] Manşet Özel Haber arşivine eklendi.');
  }
}

try {
  main();
} catch (error) {
  console.error('::error title=Ana sayfa bütünlük hatası::' + error.message);
  process.exitCode = 1;
}
