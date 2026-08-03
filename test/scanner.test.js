// test/scanner.test.js — port range parsing + dedupe (TODO 04)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePorts, DEFAULT_PORTS, MAX_PORTS, shuffle } from '../lib/scanner.js';

test('parsePorts: default when empty', () => {
  assert.deepEqual(parsePorts(), DEFAULT_PORTS.slice());
  assert.deepEqual(parsePorts(''), DEFAULT_PORTS.slice());
  assert.deepEqual(parsePorts('   '), DEFAULT_PORTS.slice());
});

test('parsePorts: single, list, range, dedupe', () => {
  assert.deepEqual(parsePorts('443'), [443]);
  assert.deepEqual(parsePorts('80,443,8080'), [80, 443, 8080]);
  assert.deepEqual(parsePorts('443, 443, 80'), [443, 80]);
  assert.deepEqual(parsePorts('8000-8003'), [8000, 8001, 8002, 8003]);
  assert.deepEqual(parsePorts('1-1'), [1]);
  assert.deepEqual(parsePorts('65535'), [65535]);
});

test('parsePorts: rejects malformed input', () => {
  for (const bad of ['abc', '80,', '22-11', '0', '65536', '1-9999', '80 443', '80-90-100']) {
    assert.throws(() => parsePorts(bad), undefined, `expected throw for "${bad}"`);
  }
});

test('parsePorts: range cap at MAX_PORTS', () => {
  assert.throws(() => parsePorts('1-100'), /max/);
  const wide = parsePorts('1-2,4-5,7-8,10-11,13-14,16-17,19-20,22-23,25-26,28-29,31-32,34-35,37-38,40-41,43-44,46-47,49-50');
  assert.equal(wide.length, 34);
  assert.ok(wide.length <= MAX_PORTS);
});

test('shuffle keeps all elements', () => {
  const arr = [1, 2, 3, 4, 5];
  const out = shuffle([...arr]).sort((a, b) => a - b);
  assert.deepEqual(out, arr);
});
