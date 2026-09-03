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

test('Mizanpaj Editörü saatte iki kez bütün sayfaları tarar ve görsel kanıt saklar', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '..', '.github', 'workflows', 'mizanpaj-editoru.yml'), 'utf8');
  assert.match(workflow, /cron: '12,42 \* \* \* \*'/);
  assert.match(workflow, /layout-audit\.js --all/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /font-too-large|Mizanpaj/);
});
