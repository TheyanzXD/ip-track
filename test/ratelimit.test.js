// test/ratelimit.test.js — sliding window + burst (TODO 03)
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLimit, clientIp } from '../lib/ratelimit.js';

test('window limit rejects beyond limit, allows within', async () => {
  const key = `t:${Date.now()}:${Math.random()}`;
  for (let i = 0; i < 3; i++) {
    const r = await checkLimit(key, { limit: 3, burst: 3 });
    assert.equal(r.allowed, true, `request ${i} should pass`);
  }
  const denied = await checkLimit(key, { limit: 3, burst: 3 });
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfter >= 1);
});

test('different keys do not share counters', async () => {
  const a = `ta:${Date.now()}:${Math.random()}`;
  const b = `tb:${Date.now()}:${Math.random()}`;
  await checkLimit(a, { limit: 1, burst: 1 });
  const r = await checkLimit(b, { limit: 1, burst: 1 });
  assert.equal(r.allowed, true);
});

test('burst exhausted but window open → soft pass', async () => {
  const key = `tburst:${Date.now()}:${Math.random()}`;
  await checkLimit(key, { limit: 10, burst: 2 });
  await checkLimit(key, { limit: 10, burst: 2 });
  const third = await checkLimit(key, { limit: 10, burst: 2 });
  assert.equal(third.allowed, true);
  assert.equal(third.burst, 0);
});

test('clientIp: x-forwarded-for first hop, ipv6-mapped normalization', () => {
  const mk = (headers, ra) => ({ headers: headers || {}, socket: { remoteAddress: ra } });
  assert.equal(clientIp(mk({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, '::1')), '203.0.113.9');
  assert.equal(clientIp(mk({ 'x-forwarded-for': 'unknown' }, '::ffff:198.51.100.2')), '198.51.100.2');
  assert.equal(clientIp(mk({}, '::1')), '127.0.0.1');
  assert.equal(clientIp(mk({}, undefined)), 'unknown');
});
