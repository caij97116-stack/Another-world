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

const analyzePresetDiagnostics = vm.runInNewContext(
  `(${extractFunction(source, 'analyzePresetDiagnostics')})`,
);

test('reports malformed preset root without throwing', () => {
  const issues = analyzePresetDiagnostics(null);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'error');
});

test('detects out-of-range sampling parameters and alias conflicts', () => {
  const issues = analyzePresetDiagnostics({
    temperature: 3.5,
    top_p: 0.8,
    max_tokens: 512,
    max_length: 1024,
  });
  assert.ok(issues.some(issue => issue.title === 'Temperature 超出常见范围'));
  assert.ok(issues.some(issue => issue.title === '最大生成长度 存在别名冲突'));
});

test('detects duplicate prompt identifiers and dangling prompt_order references', () => {
  const issues = analyzePresetDiagnostics({
    prompts: [
      { identifier: 'shared', name: 'A', enabled: true, content: 'alpha' },
      { identifier: 'shared', name: 'B', enabled: true, content: 'beta' },
    ],
    prompt_order: [
      { character_id: 100, order: [
        { identifier: 'shared', enabled: true },
        { identifier: 'missing', enabled: true },
      ] },
    ],
  });
  assert.ok(issues.some(issue => issue.title === 'identifier 重复' && issue.promptIndex === 0));
  assert.ok(issues.some(issue => issue.title === 'identifier 重复' && issue.promptIndex === 1));
  assert.ok(issues.some(issue => issue.title === '排序表引用了不存在的提示词'));
});

test('detects malformed prompt arrays and order groups', () => {
  const issues = analyzePresetDiagnostics({
    prompts: { identifier: 'not-an-array' },
    prompt_order: [{ character_id: 0 }],
  });
  assert.ok(issues.some(issue => issue.title === 'prompts 不是数组'));
  assert.ok(issues.some(issue => issue.title === '排序组结构异常'));
});

test('accepts a coherent preset and does not mutate input data', () => {
  const preset = {
    name: 'Test preset',
    temperature: 0.8,
    top_p: 0.9,
    top_k: 40,
    max_tokens: 512,
    repetition_penalty: 1.1,
    prompts: [
      { identifier: 'base', name: 'Base', role: 'system', enabled: true, content: 'Write clearly.' },
    ],
    prompt_order: [
      { character_id: 100, order: [{ identifier: 'base', enabled: true }] },
    ],
    stop_sequence: ['<END>'],
  };
  const before = JSON.stringify(preset);
  const issues = analyzePresetDiagnostics(preset);
  assert.deepEqual(JSON.parse(JSON.stringify(issues)), []);
  assert.equal(JSON.stringify(preset), before);
});

test('reports enabled prompt items with empty content', () => {
  const issues = analyzePresetDiagnostics({
    prompts: [{ identifier: 'empty', name: 'Empty prompt', enabled: true, content: '  ' }],
  });
  assert.ok(issues.some(issue => issue.title === '启用的提示词正文为空' && issue.promptIndex === 0));
});
