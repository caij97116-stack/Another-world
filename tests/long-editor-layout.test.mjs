import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const presetSource = await readFile(new URL('../src/js/preset-core.js', import.meta.url), 'utf8');
const worldbookSource = await readFile(new URL('../src/js/worldbook.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/styles/main.css', import.meta.url), 'utf8');

function extractFunction(sourceText, name) {
  const start = sourceText.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function: ${name}`);
  const open = sourceText.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < sourceText.length; index += 1) {
    if (sourceText[index] === '{') depth += 1;
    if (sourceText[index] === '}') {
      depth -= 1;
      if (depth === 0) return sourceText.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function: ${name}`);
}

test('long prompt editor expands to the full scroll height without a viewport cap', () => {
  const resize = vm.runInNewContext(`(${extractFunction(presetSource, 'autoResizeLongPrompt')})`);
  const field = { style: {}, scrollHeight: 1840 };
  resize(field);
  assert.equal(field.style.height, '1840px');
  assert.equal(field.style.overflowY, 'hidden');
});

test('worldbook content field is auto-growing and resized when an entry is loaded', () => {
  assert.match(htmlSource, /id="field_content" class="form-control auto-grow-textarea"/);
  assert.match(worldbookSource, /autoResizeLongPrompt\(document\.getElementById\('field_content'\)\)/);
});

test('preset prompt entries are collapsed by default and can expand inline', () => {
  assert.match(presetSource, /class="regex-card prompt-item-card"/);
  assert.match(presetSource, /classList\.toggle\('is-open'\)/);
  assert.match(cssSource, /\.prompt-item-card:not\(\.is-open\)>\.prompt-item-fields\{display:none\}/);
  assert.match(cssSource, /\.prompt-item-card\.is-open>\.prompt-item-fields\{display:flex\}/);
});

test('prompt content and advanced JSON editors use the full-content auto-grow behavior', () => {
  assert.match(presetSource, /prompt-content-editor auto-grow-textarea/);
  assert.match(presetSource, /raw-json auto-grow-textarea/);
  assert.match(cssSource, /textarea\.auto-grow-textarea\{[\s\S]*?max-height:none!important/);
});

test('worldbook and preset scroll panes remain vertically scrollable inside the app shell', () => {
  assert.match(cssSource, /\.wb-container\{flex:1 1 0;overflow:hidden\}/);
  assert.match(cssSource, /\.editor-workspace,\s*\.preset-workspace\{[\s\S]*?min-height:0;[\s\S]*?overflow-y:auto;[\s\S]*?-webkit-overflow-scrolling:touch/);
  assert.match(cssSource, /\.entry-list\{[\s\S]*?min-height:0;[\s\S]*?overflow-y:auto;[\s\S]*?-webkit-overflow-scrolling:touch/);
});

test('opening a collapsed advanced section recalculates long textareas', async () => {
  const eventsSource = await readFile(new URL('../src/js/dom-events.js', import.meta.url), 'utf8');
  assert.match(eventsSource, /document\.addEventListener\('toggle',[\s\S]*?textarea\.auto-grow-textarea/);
  assert.match(eventsSource, /window\.autoResizeLongPrompt\(field\)/);
});

test('worldbook and prompt editors start with a comfortable writing area', () => {
  assert.match(cssSource, /#field_content,\s*\.prompt-item-card\s+\.prompt-content-editor\s*\{\s*min-height:360px/);
  assert.match(cssSource, /@media\s*\(max-width:600px\)\s*\{[\s\S]*?#field_content,\s*\.prompt-item-card\s+\.prompt-content-editor\s*\{\s*min-height:280px/);
});
