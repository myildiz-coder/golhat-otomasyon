'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadState, selectHomepagePrimary, buildHomepageHtml, assertHomepageIntegrity, buildStoryPageHtml } = require('./editorial-lib');
const root = path.join(__dirname, '..');
const workflows = path.join(root, '.github/workflows');

test('all shared content writers queue rather than cancelling another editor', () => {
  let writers = 0;
  for (const name of fs.readdirSync(workflows)) {
    const yml = fs.readFileSync(path.join(workflows, name), 'utf8');
    if (!yml.includes('group: golhat-content-writer')) continue;
    writers++;
    assert.match(yml, /queue: max/, name);
    assert.match(yml, /cancel-in-progress: false/, name);
  }
  assert.equal(writers, 9);
});

test('every editorial publisher transfers only after successful execution', () => {
  for (const name of ['editorial-bas-editor.yml', 'editorial-kategoriler.yml', 'editorial-arastirma.yml', 'homepage-integrity.yml']) {
    const yml = fs.readFileSync(path.join(workflows, name), 'utf8');
    assert.match(yml, /if: \$\{\{ success\(\)[^\n]*\}\}\s+run: node scripts\/publication-sync\.js/, name);
    assert.doesNotMatch(yml, /https:\/\/golhat\.sonsinyal\.com\/api\/golhat\/sync/);
  }
});

test('every stored story can render and the actual headline candidate preserves page integrity', () => {
  const state = loadState();
  for (const story of state.stories) assert.doesNotThrow(() => buildStoryPageHtml(story), story.id);
  const now = new Date(state.updatedAt);
  const current = state.stories.find((s) => s.id === state.homepage.storyId);
  const candidate = selectHomepagePrimary(current, state.stories, now) || current;
  assert.ok(candidate);
  const html = buildHomepageHtml(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), candidate, now, state.stories);
  assertHomepageIntegrity(html, candidate);
});
