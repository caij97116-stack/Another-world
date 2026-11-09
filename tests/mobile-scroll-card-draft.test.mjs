import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles/main.css', import.meta.url), 'utf8');
const card = await readFile(new URL('../src/js/character-card.js', import.meta.url), 'utf8');
const events = await readFile(new URL('../src/js/dom-events.js', import.meta.url), 'utf8');
const worldbook = await readFile(new URL('../src/js/worldbook.js', import.meta.url), 'utf8');
const appCore = await readFile(new URL('../src/js/app-core.js', import.meta.url), 'utf8');
const presetCore = await readFile(new URL('../src/js/preset-core.js', import.meta.url), 'utf8');

test('mobile and touch browsers use document scrolling instead of trapped fixed-height panes', () => {
  assert.match(css, /@media\s*\(max-width:\s*860px\),\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)/);
  assert.match(css, /html,\s*body\s*\{[^}]*height:\s*auto\s*!important;[^}]*overflow-y:\s*auto\s*!important/s);
  assert.match(css, /\.main-area\s*\{[^}]*height:\s*auto\s*!important;[^}]*overflow:\s*visible\s*!important/s);
  assert.match(css, /\.page\s*\{[^}]*position:\s*relative\s*!important;[^}]*overflow:\s*visible\s*!important/s);
  assert.match(css, /\.editor-workspace,\s*\.preset-workspace,\s*\.tool-workspace\s*\{[^}]*overflow-y:\s*visible\s*!important/s);
  assert.match(css, /\.toolbar\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s);
  assert.match(css, /\.mobile-toggle\s*\{\s*display:\s*flex;/s);
  assert.match(css, /\.sidebar\s*\{[^}]*position:\s*fixed\s*!important;[^}]*transform:\s*translateX\(-105%\)/s);
  assert.match(css, /\.sidebar-overlay\s*\{[^}]*position:\s*fixed;/s);
  assert.match(css, /\.sidebar\s*\{[^}]*position:\s*fixed !important;[^}]*bottom:\s*0;/s);
  assert.match(css, /\.sidebar-overlay\s*\{[^}]*inset:\s*var\(--toolbar-height\) 0 0;/s);
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
  assert.match(card, /let cardDraftSaveQueue = Promise\.resolve\(\)/);
  assert.match(card, /function flushCharacterCardDraftSave\(\)/);
  assert.match(card, /if\(currentCard\|\|!draft\|\|!draft\.root\)return/);
  assert.match(events, /#characterCardRawJson/);
  assert.match(events, /window\.scheduleCharacterCardDraftSave\(\)/);
  assert.match(events, /window\.updateCharacterCardField\(target\.dataset\.cardField,target\.value\)/);
});


test('worldbook list rerenders preserve the active entry scroll anchor', () => {
  assert.match(worldbook, /const previousActiveTop=previousActiveCard\?previousActiveCard\.getBoundingClientRect\(\)\.top:null/);
  assert.match(worldbook, /container\.scrollTop\+=nextActiveCard\.getBoundingClientRect\(\)\.top-previousActiveTop/);
  assert.match(worldbook, /restoreListScrollAnchor\(\)/);
  assert.match(appCore, /function isCompactTouchLayout\(\)[\s\S]*?window\.matchMedia&&window\.matchMedia\('\(hover: none\) and \(pointer: coarse\)'\)/);
});


test('preset prompt rerenders preserve the active prompt card viewport anchor', () => {
  assert.match(presetCore, /const focusedCard=document\.activeElement instanceof Element/);
  assert.match(presetCore, /const anchorTop=visibleCard\?visibleCard\.getBoundingClientRect\(\)\.top:null/);
  assert.match(presetCore, /const restorePromptScrollAnchor=\(\)=>/);
  assert.match(presetCore, /if\(!nextCard\|\|!nextCard\.getClientRects\(\)\.length\)return/);
  assert.match(presetCore, /if\(workspaceScrolls\)workspace\.scrollTop\+=delta;\s*else window\.scrollBy\(0,delta\)/);
  assert.match(presetCore, /requestAnimationFrame\(restorePromptScrollAnchor\)/);
});


test('mobile page switches reset the old document scroll offset', () => {
  assert.match(appCore, /if\(isCompactTouchLayout\(\)\)window\.scrollTo\(0,0\)/);
  assert.match(css, /\.page \{ min-height: 0 !important; \}/);
});

test('character card greeting variants are extracted into editable lists', () => {
  assert.match(card, /function renderCharacterCardGreetings\(data\)/);
  assert.match(card, /alternate_greetings/);
  assert.match(card, /group_only_greetings/);
  assert.match(card, /function updateCharacterCardGreeting\(kind,index,value\)/);
  assert.match(card, /function addCharacterCardGreeting\(\)/);
  assert.match(card, /function removeCharacterCardGreeting\(kind,index\)/);
  assert.match(events, /\[data-card-greeting\]/);
  assert.match(html, /id="characterCardGreetings"/);
});
