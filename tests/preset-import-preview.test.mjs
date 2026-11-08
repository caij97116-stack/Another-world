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

const isPresetPayloadObject = vm.runInNewContext(
  `(${extractFunction(source, 'isPresetPayloadObject')})`,
);
const unwrapPresetObject = vm.runInNewContext(
  `(${extractFunction(source, 'unwrapPresetObject')})`,
  { isPresetPayloadObject },
);
const countPresetArrayAtPaths = vm.runInNewContext(
  `(${extractFunction(source, 'countPresetArrayAtPaths')})`,
);

test('preview accepts a common direct preset object', () => {
  const payload = { name: 'Example', prompts: [], prompt_order: [], temperature: 0.8 };
  assert.equal(isPresetPayloadObject(payload), true);
  assert.equal(unwrapPresetObject(payload).envelope, null);
});

test('preview recognizes and preserves a supported outer wrapper', () => {
  const payload = { prompts: [{ identifier: 'main' }] };
  const parsed = { description: 'metadata', preset: payload, extra: { keep: true } };
  const result = unwrapPresetObject(parsed);
  assert.equal(result.data, payload);
  assert.equal(result.envelope.key, 'preset');
  assert.equal(result.envelope.wrapper, parsed);
});

test('preview rejects arrays and primitive JSON roots', () => {
  assert.throws(() => unwrapPresetObject([]), /JSON 对象/);
  assert.throws(() => unwrapPresetObject('not a preset'), /JSON 对象/);
});

test('preview array counts follow the first supported original path', () => {
  const data = {
    extensions: { regex_scripts: [{ id: 1 }, { id: 2 }] },
    scripts: [{ id: 'top-level' }],
  };
  assert.equal(countPresetArrayAtPaths(data, [
    ['regex_scripts'], ['extensions', 'regex_scripts'],
  ]), 2);
  assert.equal(countPresetArrayAtPaths(data, [
    ['tavernhelper', 'scripts'], ['scripts'],
  ]), 1);
});

test('preview returns zero when no supported extension array exists', () => {
  assert.equal(countPresetArrayAtPaths({ prompts: [] }, [
    ['regex_scripts'], ['extensions', 'regex_scripts'],
  ]), 0);
});
