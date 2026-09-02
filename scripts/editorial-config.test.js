'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { EDITORIAL_POLICY, EDITOR_ROLES, PAGE_OWNERS } = require('./editorial-config');

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
