'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_VIEWPORTS,
  LAYOUT_LIMITS,
  discoverPages,
  parseArgs
} = require('./layout-audit');

test('Mizanpaj Editörü mobil, masaüstü ve geniş ekran görünümünü birlikte denetler', () => {
  assert.deepEqual(DEFAULT_VIEWPORTS.map((item) => item.name), ['mobile', 'desktop', 'wide']);
  assert.equal(DEFAULT_VIEWPORTS[0].width, 390);
  assert.equal(DEFAULT_VIEWPORTS[1].width, 1440);
  assert.equal(DEFAULT_VIEWPORTS[2].width, 2560);
  assert.ok(LAYOUT_LIMITS.mobile.h1 < LAYOUT_LIMITS.desktop.h1);
  assert.ok(LAYOUT_LIMITS.desktop.h1 < LAYOUT_LIMITS.wide.h1);
  assert.ok(LAYOUT_LIMITS.minimumWideShellRatio >= 0.5);
  assert.ok(LAYOUT_LIMITS.minimumWideStoryRatio >= 0.44);
  assert.ok(LAYOUT_LIMITS.desktop.maximumHeadlineLines <= 4);
  assert.ok(LAYOUT_LIMITS.wide.h1 <= 96);
  assert.ok(LAYOUT_LIMITS.minimumBodyLineHeightRatio >= 1.18);
});

test('Mizanpaj Editörü kök sayfaları ve istenirse kalıcı haberleri bulur', () => {
  const root = path.resolve(__dirname, '..');
  const rootPages = discoverPages(root, false);
  const allPages = discoverPages(root, true);
  assert.ok(rootPages.includes('index.html'));
  assert.ok(rootPages.includes('yorum.html'));
  assert.ok(allPages.length > rootPages.length);
  assert.ok(allPages.some((page) => page.startsWith('haber/')));
});

test('Mizanpaj komut satırı kapsam ve rapor hedefini açıkça çözer', () => {
  const options = parseArgs(['--all', '--report', 'tmp/layout.json', '--screenshots', 'tmp/shots']);
  assert.equal(options.includeStories, true);
  assert.equal(path.isAbsolute(options.report), true);
  assert.equal(path.isAbsolute(options.screenshots), true);
  assert.throws(() => parseArgs(['--bilinmeyen']), /Bilinmeyen seçenek/);
});

test('bütün kök sayfalar responsive viewport meta etiketi taşır', () => {
  const root = path.resolve(__dirname, '..');
  for (const page of discoverPages(root, false)) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /<meta name="viewport"[^>]*width=device-width/i, page);
  }
});

test('görsel editörün ortak tipografi katmanı bütün yayın sayfalarında kalıcıdır', () => {
  const root = path.resolve(__dirname, '..');
  for (const page of discoverPages(root, true)) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /<head(?:\s[^>]*)?>/i, page);
    assert.match(html, /<\/head>/i, page);
    assert.match(html, /<body(?:\s[^>]*)?>/i, page);
    assert.match(html, /typography-tuning\.css/i, page);
  }
});

test('kalıcı haber şablonu geniş ekranda dengeli başlık ve yayın alanı kullanır', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'editorial-lib.js'), 'utf8');
  assert.match(source, /width:min\(1180px,calc\(100% - 48px\)\)/);
  assert.match(source, /clamp\(2\.8rem,5vw,4\.6rem\)/);
  assert.match(source, /max-width:26ch/);
  assert.match(source, /text-wrap:balance/);
  assert.doesNotMatch(source, /clamp\(2\.7rem,8vw,5\.7rem\)/);
});

test('Skor ve Yorum ana başlıkları görsel editör sınırlarını aşmaz', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'typography-tuning.css'), 'utf8');
  assert.match(css, /score-page \.hero h1[\s\S]*clamp\(3\.4rem, 6vw, 5\.5rem\)/);
  assert.match(css, /opinion-page \.page-hero h1[\s\S]*clamp\(3\.2rem, 6vw, 5\.4rem\)/);
  assert.match(css, /clamp\(2\.8rem, 13\.5vw, 3\.5rem\)/);
  assert.match(css, /score-page \.wordmark[\s\S]*font-size: 3\.4rem/);
});

test('Mizanpaj Editörü saatte iki kez bütün sayfaları tarar ve görsel kanıt saklar', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '..', '.github', 'workflows', 'mizanpaj-editoru.yml'), 'utf8');
  assert.match(workflow, /cron: '12,42 \* \* \* \*'/);
  assert.match(workflow, /layout-audit\.js --all/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /font-too-large|Mizanpaj/);
});
