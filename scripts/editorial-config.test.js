'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EDITORIAL_POLICY, GOLHAT_ORIGINAL_JOURNALISM_POLICY, GOLHAT_PUBLISHER_EXPERIENCE, GOLHAT_SEO_PLAYBOOK,
  COMMENTARY_WRITERS, EDITOR_ROLES, PAGE_LABELS, PAGE_OWNERS, PAGE_TOPIC_RULES
} = require('./editorial-config');

test('depodaki her HTML sayfasının tek bir sorumlu editörü vardır', () => {
  const root = path.resolve(__dirname, '..');
  const pages = fs.readdirSync(root)
    .filter((name) => name.endsWith('.html'))
    .sort();
  assert.deepEqual(Object.keys(PAGE_OWNERS).sort(), pages);
  assert.equal(new Set(Object.keys(PAGE_OWNERS)).size, pages.length);
});

test('her içerik editörü yalnızca tek sayfadan sorumludur', () => {
  const editorialPages = Object.entries(PAGE_OWNERS)
    .filter(([, owner]) => !['bas_editor', 'canli_skor'].includes(owner));
  for (const [page, owner] of editorialPages) {
    assert.ok(EDITOR_ROLES[owner], page + ' için editör rolü bulunamadı');
    assert.deepEqual(EDITOR_ROLES[owner].pages, [page]);
  }
  assert.equal(Object.keys(EDITOR_ROLES).length, editorialPages.length);
});

test('yorum masası benzersiz ve açıkça tanımlı müstear yazarlardan oluşur', () => {
  const names = COMMENTARY_WRITERS.map((writer) => writer.name);
  assert.equal(names.length, 4);
  assert.equal(new Set(names).size, names.length);
  assert.equal(COMMENTARY_WRITERS.filter((writer) => writer.lead).length, 1);
  assert.equal(COMMENTARY_WRITERS.find((writer) => writer.lead).name, 'Ters Kademe');
  assert.deepEqual(EDITOR_ROLES.yorum.columnists, COMMENTARY_WRITERS);
  const page = fs.readFileSync(path.resolve(__dirname, '..', 'yorum.html'), 'utf8');
  for (const writer of COMMENTARY_WRITERS) {
    assert.match(page, new RegExp(writer.name));
  }
  assert.match(page, /gerçek kişi iddiası taşımaz/);
  const runner = fs.readFileSync(path.resolve(__dirname, 'run-editorial.js'), 'utf8');
  assert.match(runner, /buildAssignmentSnapshot/);
  assert.match(runner, /son 12 saatte yeni olay bulunması şartını uygulama/);
  assert.match(runner, /GOLHAT canlı veri özeti/);
});

test('ortak yayın politikası temel editoryal dengeleri kalıcı olarak taşır', () => {
  for (const phrase of [
    'bölünmez bütünlüğünü',
    'Gazi Mustafa Kemal Atatürk',
    'Kuzey Kıbrıs Türk Cumhuriyeti (KKTC)',
    'olguları saklama, çarpıtma veya uydurma',
    'düşmanlaştırıcı dil kullanma'
  ]) {
    assert.match(EDITORIAL_POLICY, new RegExp(phrase.replace(/[()]/g, '\\$&')));
  }
});

test('özgün habercilik felsefesi kaynak derlemesini ve otomatik özel haber etiketini reddeder', () => {
  for (const phrase of [
    'yeniden yazmak özgün habercilik sayılmaz',
    'en az iki yeni bulgu',
    'Otomasyon kendi başına Özel Haber yayımlayamaz',
    'cevap hakkı'
  ]) assert.match(GOLHAT_ORIGINAL_JOURNALISM_POLICY, new RegExp(phrase));
  const page = fs.readFileSync(path.resolve(__dirname, '..', 'ozel-haber.html'), 'utf8');
  assert.match(page, /id="golhat-original-journalism-charter"/);
  assert.match(page, /Özgün habercilik felsefemiz/);
  assert.match(page, /Kaynak derlemesi özgün haber değildir/);
});

test('yayıncı tecrübesi mevcut mimariyi bozmadan haberin düşünme ve yazma derinliğini artırır', () => {
  for (const phrase of [
    'yeni bir yayın politikası değildir',
    'MİHENK adı',
    'İlk sorunun cevabı haberdir',
    'original_angle',
    'Nedensellik yalnız kanıtlandığı ölçüde',
    'bilgi yoğunluğu'
  ]) assert.match(GOLHAT_PUBLISHER_EXPERIENCE, new RegExp(phrase));

  const runner = fs.readFileSync(path.resolve(__dirname, 'run-editorial.js'), 'utf8');
  assert.ok((runner.match(/GOLHAT_PUBLISHER_EXPERIENCE/g) || []).length >= 2);
  assert.doesNotMatch(runner, /editorial_review|storycraft_review/);

  const researchPage = fs.readFileSync(path.resolve(__dirname, '..', 'ozel-haber.html'), 'utf8');
  const homepage = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  assert.doesNotMatch(researchPage, /mihenk-editorial-lens|MİHENK KONTROLÜ/);
  assert.doesNotMatch(homepage, /MİHENK|kendi mihenginde/);
});

test('SEO disiplini arama motoru için seri içerik yerine özgün ve insan odaklı haberi korur', () => {
  for (const phrase of ['arama motorunu kandırmak değil', 'tek bir açık arama niyetine', 'anahtar kelime yığma', 'h1 ile aynı olguyu', 'Eski haberi yeniymiş gibi', 'Arama potansiyeli haber değerinin yerine geçmez']) {
    assert.match(GOLHAT_SEO_PLAYBOOK, new RegExp(phrase));
  }
  const runner = fs.readFileSync(path.resolve(__dirname, 'run-editorial.js'), 'utf8');
  assert.ok((runner.match(/GOLHAT_SEO_PLAYBOOK/g) || []).length >= 2);
});

test('her yayın sayfasının kodla uygulanan bir konu sınırı vardır', () => {
  assert.deepEqual(Object.keys(PAGE_TOPIC_RULES).sort(), Object.keys(PAGE_LABELS).sort());
  for (const [page, rule] of Object.entries(PAGE_TOPIC_RULES)) {
    assert.ok(Array.isArray(rule.requiredAny), page + ' konu terimleri tanımsız');
  }
});

test('tüm yayın sayfaları Google site kimliği ve önizleme kurallarını taşır', () => {
  const root = path.resolve(__dirname, '..');
  for (const page of Object.keys(PAGE_OWNERS)) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /rel="canonical"/);
    assert.match(html, /max-image-preview:large/);
    assert.match(html, /rel="icon" href="\/favicon.svg"/);
    assert.match(html, /application\/ld\+json/);
  }
  const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(homepage, /"@type":"WebSite"/);
  assert.match(homepage, /"alternateName":["GOL\/HAT","golhat.com"]/);
  const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/golhat.com\/sitemap.xml/);
  assert.match(robots, /Sitemap: https:\/\/golhat.com\/news-sitemap.xml/);
  assert.match(fs.readFileSync(path.join(root, 'favicon.svg'), 'utf8'), /viewBox="0 0 96 96"/);
});

test('kategori editörleri saatte iki kez, baş editör her 15 dakikada 7/24 çalışır', () => {
  const root = path.resolve(__dirname, '..');
  const workflow = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'editorial-kategoriler.yml'),
    'utf8'
  );
  const headWorkflow = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'editorial-bas-editor.yml'),
    'utf8'
  );
  assert.match(workflow, /cron: '5,35 \* \* \* \*'/);
  assert.match(headWorkflow, /cron: '\*\/15 \* \* \* \*'/);
});

test('yayın iş akışları haber site haritasını commit kapsamına alır', () => {
  const root = path.resolve(__dirname, '..');
  for (const name of [
    'editorial-kategoriler.yml',
    'editorial-arastirma.yml',
    'editorial-bas-editor.yml',
    'homepage-integrity.yml'
  ]) {
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', name), 'utf8');
    assert.match(workflow, /git add .*sitemap\.xml news-sitemap\.xml/, name);
  }
});

test('her kategori sayfasında tek bir canlı haber masası durumu görünür', () => {
  const root = path.resolve(__dirname, '..');
  for (const role of Object.values(EDITOR_ROLES)) {
    for (const page of role.pages) {
      const html = fs.readFileSync(path.join(root, page), 'utf8');
      assert.equal(
        (html.match(/GOLHAT:PAGE_LIVE:START/g) || []).length,
        1,
        page + ' CANLI durum bandı tekil değil'
      );
      assert.match(html, /● CANLI/);
    }
  }
});


test('araştırma kurulu dört saatte bir ayrı vardiyada çalışır', () => {
  const root = path.resolve(__dirname, '..');
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'editorial-arastirma.yml'), 'utf8');
  const runner = fs.readFileSync(path.join(root, 'scripts', 'run-editorial.js'), 'utf8');
  assert.match(workflow, /cron: '40 \*\/4 \* \* \*'/);
  assert.match(workflow, /--role ozel_haber/);
  assert.match(runner, /filter\(\(role\) => role !== 'ozel_haber'\)/);
});
