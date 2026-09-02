'use strict';

const {
  loadState,
  writeHomepageArchive,
  writeStoryPages,
  writeSitemap,
  writeNewsSitemap,
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

  const storyPagesChanged = writeStoryPages(state.stories, publishedAt);
  const sitemapChanged = writeSitemap(state.stories, publishedAt);
  const newsSitemapChanged = writeNewsSitemap(state.stories, publishedAt);
  const changed = writeHomepage(story, publishedAt, state.stories);
  const archiveChanged = writeHomepageArchive(story, publishedAt);
  console.log(
    changed
      ? '[Ana Sayfa Bütünlük] Kopukluk bulundu ve tüm manşet dosyası yeniden kuruldu.'
      : '[Ana Sayfa Bütünlük] Manşet, analiz, kaynaklar ve karar aynı habere bağlı.'
  );
  if (archiveChanged) {
    console.log('[Ana Sayfa Bütünlük] Manşet Özel Haber arşivine eklendi.');
  }
  console.log('[Ana Sayfa Bütünlük] Kalıcı haber sayfaları=' + storyPagesChanged + ', sitemap=' + (sitemapChanged ? 'güncellendi' : 'aynı') + ', haber sitemap=' + (newsSitemapChanged ? 'güncellendi' : 'aynı') + '.');
}

try {
  main();
} catch (error) {
  console.error('::error title=Ana sayfa bütünlük hatası::' + error.message);
  process.exitCode = 1;
}
