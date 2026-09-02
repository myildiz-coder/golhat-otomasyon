'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EDITORIAL_POLICY, GOLHAT_ORIGINAL_JOURNALISM_POLICY, MIHENK_EDITORIAL_LENS,
  EDITOR_ROLES, PAGE_LABELS, PAGE_OWNERS, PAGE_TOPIC_RULES
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

test('Mihenk bakışı bütün editörlerin uyguladığı ve okurun görebildiği bir yayın merceğidir', () => {
  for (const phrase of [
    'Risale-i Nur',
    'Tahkik esastır',
    'Müsbet hareket esastır',
    'Uhuvvet ve şefkat esastır',
    'Said Nursî böyle derdi',
    'Haber ile yorumu açıkça ayır'
  ]) assert.match(MIHENK_EDITORIAL_LENS, new RegExp(phrase));

  const runner = fs.readFileSync(path.resolve(__dirname, 'run-editorial.js'), 'utf8');
  assert.ok((runner.match(/MIHENK_EDITORIAL_LENS/g) || []).length >= 3);

  const researchPage = fs.readFileSync(path.resolve(__dirname, '..', 'ozel-haber.html'), 'utf8');
  const homepage = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  assert.match(researchPage, /id="mihenk-editorial-lens"/);
  assert.match(researchPage, /Tahkik · Adalet · Müsbet Hareket/);
  assert.match(homepage, /kendi mihenginde tartar/);
});

test('her yayın sayfasının kodla uygulanan bir konu sınırı vardır', () => {
  assert.deepEqual(Object.keys(PAGE_TOPIC_RULES).sort(), Object.keys(PAGE_LABELS).sort());
  for (const [page, rule] of Object.entries(PAGE_TOPIC_RULES)) {
    assert.ok(Array.isArray(rule.requiredAny), page + ' konu terimleri tanımsız');
  }
});

test('kategori editörleri her saat 7/24 çalışır', () => {
  const root = path.resolve(__dirname, '..');
  const workflow = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'editorial-kategoriler.yml'),
    'utf8'
  );
  assert.match(workflow, /cron: '20 \* \* \* \*'/);
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
