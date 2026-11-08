import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/js/preset-core.js', import.meta.url), 'utf8');

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

const countPresetJsonNodes = vm.runInNewContext(
  `(${extractFunction(source, 'countPresetJsonNodes')})`,
);
const inspectPresetExportRoundTrip = vm.runInNewContext(
  `(${extractFunction(source, 'inspectPresetExportRoundTrip')})`,
  { countPresetJsonNodes },
);

test('export round-trip inspection preserves nested JSON data', () => {
  const input = {
    name: 'Round trip',
    prompts: [{ identifier: 'main', content: 'long prompt', extensions: { custom: [1, 2] } }],
    prompt_order: [{ character_id: 0, order: [{ identifier: 'main', enabled: true }] }],
    regex_scripts: [{ id: 'r1', disabled: false, replaceString: 'x' }],
    scripts: [{ id: 's1', code: 'return 1;' }],
    extension_unknown: { keep: { nested: true } },
  };
  const result = inspectPresetExportRoundTrip(input);
  assert.ok(result.serialized);
  assert.deepEqual(JSON.parse(result.serialized), input);
  assert.equal(result.issues.length, 0);
  assert.equal(result.beforeNodes, result.afterNodes);
});

test('export round-trip inspection reports undefined object fields dropped by JSON', () => {
  const result = inspectPresetExportRoundTrip({ prompts: [], extension_unknown: { lost: undefined } });
  assert.ok(result.serialized);
  assert.ok(result.issues.some(issue => issue.path === '$.extension_unknown.lost' && issue.reason.includes('丢失')));
});

test('export round-trip inspection reports non-finite numeric values', () => {
  const result = inspectPresetExportRoundTrip({ temperature: Number.NaN });
  assert.ok(result.issues.some(issue => issue.path === '$.temperature' && issue.reason.includes('非有限数字')));
});

test('export round-trip inspection blocks values JSON cannot serialize', () => {
  const result = inspectPresetExportRoundTrip({ value: 1n });
  assert.equal(result.serialized, null);
  assert.match(result.issues[0].reason, /无法序列化/);
});

test('export round-trip inspection handles cyclic objects without recursing forever', () => {
  const input = { prompts: [] };
  input.loop = input;
  const result = inspectPresetExportRoundTrip(input);
  assert.equal(result.serialized, null);
  assert.match(result.issues[0].reason, /无法序列化/);
});
