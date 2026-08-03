// test/netguard.test.js — SSRF guard + target parsing (TODO 01)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyIP, isBlocked, parseTarget, normalizeHost, isPunycode,
  guardPort, guardIp, maxRedirects, ERR
} from '../lib/netguard.js';

test('classifyIP: private ranges', () => {
  assert.equal(classifyIP('10.1.2.3').kind, 'private');
  assert.equal(classifyIP('172.16.0.1').kind, 'private');
  assert.equal(classifyIP('172.31.255.254').kind, 'private');
  assert.equal(classifyIP('192.168.1.1').kind, 'private');
  assert.equal(classifyIP('192.168.255.255').kind, 'private');
});

test('classifyIP: loopback, metadata, link-local, CGNAT', () => {
  assert.equal(classifyIP('127.0.0.1').kind, 'loopback');
  assert.equal(classifyIP('169.254.169.254').kind, 'metadata');
  assert.equal(classifyIP('169.254.10.20').kind, 'linklocal');
  assert.equal(classifyIP('100.64.0.1').kind, 'cgNat');
  assert.equal(classifyIP('100.127.255.255').kind, 'cgNat');
  assert.equal(classifyIP('100.128.0.1').kind, 'public');
});

test('classifyIP: IPv6', () => {
  assert.equal(classifyIP('::1').kind, 'loopback');
  assert.equal(classifyIP('::').kind, 'unspecified');
  assert.equal(classifyIP('fe80::1').kind, 'linklocal');
  assert.equal(classifyIP('fc00::1').kind, 'ula');
  assert.equal(classifyIP('fd00::1').kind, 'ula');
  assert.equal(classifyIP('ff02::1').kind, 'multicast');
  assert.equal(classifyIP('2001:db8::1').kind, 'documentation');
  assert.equal(classifyIP('2606:4700:4700::1111').kind, 'public');
});

test('classifyIP: IPv4-mapped IPv6 delegates to v4', () => {
  assert.equal(classifyIP('::ffff:10.0.0.1').kind, 'private');
  assert.equal(classifyIP('::ffff:8.8.8.8').kind, 'public');
});

test('classifyIP: reserved, broadcast, multicast, invalid', () => {
  assert.equal(classifyIP('0.0.0.0').kind, 'unspecified');
  assert.equal(classifyIP('192.0.0.1').kind, 'reserved');
  assert.equal(classifyIP('198.18.5.5').kind, 'reserved');
  assert.equal(classifyIP('224.0.0.1').kind, 'multicast');
  assert.equal(classifyIP('240.1.1.1').kind, 'reserved');
  assert.equal(classifyIP('255.255.255.255').kind, 'broadcast');
  assert.equal(classifyIP('not-an-ip').kind, 'invalid');
  assert.equal(classifyIP('8.8.8.8').kind, 'public');
});

test('isBlocked mirrors BLOCKED_KINDS', () => {
  assert.equal(isBlocked('127.0.0.1').blocked, true);
  assert.equal(isBlocked('169.254.169.254').blocked, true);
  assert.equal(isBlocked('192.168.1.1').blocked, true);
  assert.equal(isBlocked('8.8.8.8').blocked, false);
  assert.equal(isBlocked('1.1.1.1').blocked, false);
  assert.equal(isBlocked('255.255.255.255').blocked, true);
});

test('parseTarget: plain IPs', () => {
  const v4 = parseTarget('8.8.8.8');
  assert.equal(v4.type, 'ipv4');
  assert.equal(v4.value, '8.8.8.8');
  const v6 = parseTarget('[2606:4700::1111]');
  assert.equal(v6.type, 'ipv6');
  assert.equal(v6.value, '2606:4700::1111');
});

test('parseTarget: domains normalize + punycode', () => {
  const d = parseTarget('  Example.COM. ');
  assert.equal(d.type, 'domain');
  assert.equal(d.value, 'example.com');
  const idn = parseTarget('bücher.example');
  assert.equal(idn.asciiHost, 'xn--bcher-kva.example');
  assert.equal(isPunycode(idn.asciiHost), true);
});

test('parseTarget: http(s) URLs only', () => {
  const u = parseTarget('https://example.com/path?q=1');
  assert.equal(u.type, 'url');
  assert.equal(u.host, 'example.com');
  assert.equal(u.port, 443);
  const h = parseTarget('http://example.com');
  assert.equal(h.port, 80);
  const customPort = parseTarget('https://example.com:8443/');
  assert.equal(customPort.port, 8443);
});

test('parseTarget: file:// and ftp:// treated as hostname (no scheme match)', () => {
  const f = parseTarget('ftp://example.com');
  assert.equal(f.type, 'domain');
  assert.equal(f.value, 'example.com');
});

test('parseTarget: invalid inputs throw INVALID_TARGET', () => {
  for (const bad of ['', '   ', null, undefined, 42, 'a', 'bad..com', '-x.com', 'x-.com', 'com.', 'a'.repeat(300)]) {
    assert.throws(() => parseTarget(bad), e => e.code === ERR.INVALID_TARGET, `expected throw for ${JSON.stringify(bad)}`);
  }
});

test('normalizeHost: rejects bad TLD and labels', () => {
  assert.throws(() => normalizeHost('example.c'), e => e.code === ERR.INVALID_TARGET);
  assert.throws(() => normalizeHost('foo_bar.com'), e => e.code === ERR.INVALID_TARGET);
  assert.equal(normalizeHost('EXAMPLE.com'), 'example.com');
});

test('guardPort: allowlist and bounds', () => {
  assert.equal(guardPort(443), 443);
  assert.throws(() => guardPort(22), e => e.code === ERR.BLOCKED_TARGET);
  assert.throws(() => guardPort(0), e => e.code === ERR.INVALID_TARGET);
  assert.throws(() => guardPort(65536), e => e.code === ERR.INVALID_TARGET);
  assert.throws(() => guardPort('443'), e => e.code === ERR.INVALID_TARGET);
});

test('guardIp: blocks private, allows public', () => {
  assert.throws(() => guardIp('10.0.0.1'), e => e.code === ERR.BLOCKED_TARGET);
  assert.throws(() => guardIp('::ffff:127.0.0.1'), e => e.code === ERR.BLOCKED_TARGET);
  assert.equal(guardIp('1.1.1.1'), '1.1.1.1');
});

test('maxRedirects: caps chain length', () => {
  assert.equal(maxRedirects(['a', 'b', 'c'], 5), true);
  assert.throws(() => maxRedirects(new Array(6).fill('x'), 5), e => e.code === ERR.BLOCKED_TARGET);
});
