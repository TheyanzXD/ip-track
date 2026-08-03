// test/homograph.test.js — confusable detection (TODO 05)
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectConfusables, isSuspiciousDomain } from '../lib/homograph.js';

test('plain ascii domains are safe', () => {
  const r = detectConfusables('example.com');
  assert.equal(r.suspicious, false);
  assert.equal(isSuspiciousDomain('google.com'), false);
});

test('cyrillic lookalike flagged', () => {
  const r = detectConfusables('goоgle.com'); // cyrillic о
  assert.equal(r.suspicious, true);
  assert.equal(r.flags.cyrillic, true);
  assert.equal(r.flags.confusableWithAscii, true);
  assert.equal(isSuspiciousDomain('goоgle.com'), true);
});

test('punycode-encoded lookalike: xn-- form is ascii, not flagged', () => {
  const r = detectConfusables('xn--ggle-0nda.com');
  assert.equal(r.suspicious, false);
});

test('greek confusables flagged', () => {
  const r = detectConfusables('αρυρh.com'); // greek letters
  assert.equal(r.suspicious, true);
  assert.equal(r.flags.greek, true);
});
