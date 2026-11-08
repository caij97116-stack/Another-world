import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/js/character-card.js', import.meta.url), 'utf8');
const exposed = source.replace(/\}\)\(\);\s*$/, `
    window.__test = { getCardData, stageCharacterResourceBundle, getStagedBundle: () => stagedResourceBundle };
})();
`);
assert.notEqual(exposed, source, 'test seam must match the character-card IIFE');

const messages = [];
const preview = { hidden: true, innerHTML: '' };
const windowStub = {};
const context = {
  window: windowStub,
  document: { getElementById: id => id === 'characterCardBundleImportPreview' ? preview : null },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  showToast: (message, type) => messages.push({ message: String(message), type }),
  console, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, DataView, Blob, Response,
  DecompressionStream, atob, btoa, setTimeout, clearTimeout, URL
};
vm.runInNewContext(exposed, context, { filename: 'character-card.js' });
const api = windowStub.__test;

function fingerprint(value) {
  const input = JSON.stringify(value) || '';
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function makeBundle() {
  const worldbook = { name: 'Synthetic Worldbook', entries: { 'entry-1': {
    uid: 'entry-1', comment: 'Synthetic entry', content: 'Test-only content',
    extensions: { unknownFutureField: { keep: true } }
  } }, unknownWorldbookField: { version: 7 } };
  return {
    format: 'another-world-character-resource-bundle', format_version: 1,
    manifest: { character: { name: 'Synthetic Character', spec: 'chara_card_v3', spec_version: '3.0' },
      resources: [{ type: 'worldbook', name: 'Synthetic Worldbook', summary: '1 entry', fingerprint: fingerprint(worldbook) }] },
    character_card: { spec: 'chara_card_v3', spec_version: '3.0', data: {
      name: 'Synthetic Character', extensions: { custom: { preserve: 'yes' } }
    } },
    resources: { worldbook }
  };
}
async function stage(raw) {
  messages.length = 0; preview.hidden = true; preview.innerHTML = '';
  api.stageCharacterResourceBundle({ size: Buffer.byteLength(raw), text: async () => raw });
  await new Promise(resolve => setImmediate(resolve));
}

test('recognizes flat V1 cards and preserves unknown fields', () => {
  const parsed = api.getCardData({ name: 'V1 Sample', custom_extension: { keep: 1 } });
  assert.equal(parsed.spec, 'chara_card_v1'); assert.equal(parsed.version, '1.0'); assert.equal(parsed.shape, 'flat');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.data.custom_extension)), { keep: 1 });
});
test('recognizes V2 envelope cards without flattening nested data', () => {
  const parsed = api.getCardData({ spec: 'chara_card_v2', spec_version: '2.0', data: {
    name: 'V2 Sample', character_book: { entries: [{ keys: ['x'] }] }, extensions: { vendor: 42 }
  } });
  assert.equal(parsed.name, 'V2 Sample'); assert.equal(parsed.shape, 'envelope');
  assert.equal(parsed.data.character_book.entries.length, 1); assert.equal(parsed.data.extensions.vendor, 42);
});
test('recognizes V3 envelope cards and preserves V3-only fields', () => {
  const parsed = api.getCardData({ spec: 'chara_card_v3', spec_version: '3.0', data: {
    name: 'V3 Sample', assets: [{ type: 'icon', uri: 'embedded://sample' }],
    group_only_greetings: ['hello'], unknown: { nested: true }
  } });
  assert.equal(parsed.version, '3.0'); assert.equal(parsed.data.assets[0].uri, 'embedded://sample');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.data.unknown)), { nested: true });
});
test('rejects cards without a usable name', () => {
  assert.throws(() => api.getCardData({ spec: 'chara_card_v3', data: { description: 'no name' } }), /角色名称字段 name/);
  assert.throws(() => api.getCardData([]), /有效的 JSON 对象/);
});
test('stages a valid synthetic bundle without applying it', async () => {
  const bundle = makeBundle(); await stage(JSON.stringify(bundle));
  const staged = api.getStagedBundle();
  assert.ok(staged); assert.equal(staged.character_card.data.name, 'Synthetic Character');
  assert.equal(staged.resources.worldbook.entries['entry-1'].content, 'Test-only content');
  assert.equal(preview.hidden, false); assert.match(preview.innerHTML, /Synthetic Character/);
  assert.equal(messages.at(-1).type, 'success');
});
test('rejects corrupt JSON and unsupported versions', async () => {
  await stage('{broken'); assert.equal(api.getStagedBundle(), null);
  assert.match(messages.at(-1).message, /JSON 无法解析/);
  const badVersion = makeBundle(); badVersion.format_version = 99;
  await stage(JSON.stringify(badVersion)); assert.equal(api.getStagedBundle(), null);
  assert.match(messages.at(-1).message, /不支持的资源包格式或版本/);
});
test('rejects duplicate resources and fingerprint mismatches', async () => {
  const duplicate = makeBundle(); duplicate.manifest.resources.push({ ...duplicate.manifest.resources[0] });
  await stage(JSON.stringify(duplicate)); assert.equal(api.getStagedBundle(), null);
  assert.match(messages.at(-1).message, /未知或重复/);
  const tampered = makeBundle(); tampered.resources.worldbook.entries['entry-1'].content = 'tampered';
  await stage(JSON.stringify(tampered)); assert.equal(api.getStagedBundle(), null);
  assert.match(messages.at(-1).message, /指纹不匹配/);
});
test('rejects malformed worldbook entries', async () => {
  const invalid = makeBundle(); invalid.resources.worldbook.entries['entry-1'] = 'not-an-object';
  invalid.manifest.resources[0].fingerprint = fingerprint(invalid.resources.worldbook);
  await stage(JSON.stringify(invalid)); assert.equal(api.getStagedBundle(), null);
  assert.match(messages.at(-1).message, /世界书条目结构无效/);
});
