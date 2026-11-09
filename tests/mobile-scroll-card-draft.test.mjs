import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles/main.css', import.meta.url), 'utf8');
const card = await readFile(new URL('../src/js/character-card.js', import.meta.url), 'utf8');
const events = await readFile(new URL('../src/js/dom-events.js', import.meta.url), 'utf8');

test('mobile and touch browsers use document scrolling instead of trapped fixed-height panes', () => {
  assert.match(css, /@media\s*\(max-width:\s*860px\),\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)/);
  assert.match(css, /html,\s*body\s*\{[^}]*height:\s*auto\s*!important;[^}]*overflow-y:\s*auto\s*!important/s);
  assert.match(css, /\.main-area\s*\{[^}]*height:\s*auto\s*!important;[^}]*overflow:\s*visible\s*!important/s);
  assert.match(css, /\.page\s*\{[^}]*position:\s*relative\s*!important;[^}]*overflow:\s*visible\s*!important/s);
  assert.match(css, /\.editor-workspace,\s*\.preset-workspace,\s*\.tool-workspace\s*\{[^}]*overflow-y:\s*visible\s*!important/s);
});

test('character card drafts are stored in IndexedDB with a localStorage fallback', () => {
  assert.match(card, /indexedDB\.open\(CARD_DRAFT_DB_NAME,1\)/);
  assert.match(card, /objectStore\(CARD_DRAFT_STORE_NAME\)\.put\(payload\)/);
  assert.match(card, /localStorage\.setItem\(CARD_DRAFT_STORAGE_KEY,JSON\.stringify\(fallback\)\)/);
  assert.match(card, /fileBlob:currentCardFile&&String\(currentCardFile\.type\|\|''\)\.startsWith\('image\/'\)/);
});

test('character card drafts restore the JSON and original image blob after reload', () => {
  assert.match(card, /async function restoreCharacterCardDraft\(\)/);
  assert.match(card, /new File\(\[draft\.fileBlob\]/);
  assert.match(card, /renderCard\(parsed,file\)/);
  assert.match(card, /DOMContentLoaded',restoreCharacterCardDraft/);
  assert.match(card, /addEventListener\('pagehide'/);
  assert.match(card, /visibilitychange/);
});

test('structured fields and unfinished raw JSON edits schedule local draft saves', () => {
  assert.match(card, /scheduleCharacterCardDraftSave\(\)/);
  assert.match(events, /#characterCardRawJson/);
  assert.match(events, /window\.scheduleCharacterCardDraftSave\(\)/);
  assert.match(events, /window\.updateCharacterCardField\(target\.dataset\.cardField,target\.value\)/);
});
