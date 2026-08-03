// test/validator.test.js — zero-dep schema validator (TODO 19)
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../lib/validator.js';

test('type checks incl. integer-as-number', () => {
  assert.deepEqual(validate({ type: 'string' }, 'x'), []);
  assert.deepEqual(validate({ type: 'string' }, 5).length, 1);
  assert.deepEqual(validate({ type: 'number' }, 5), []);
  assert.deepEqual(validate({ type: 'integer' }, 5), []);
  assert.deepEqual(validate({ type: 'integer' }, 5.5).length, 1);
});

test('required + nested properties', () => {
  const s = {
    type: 'object',
    required: ['status', 'message'],
    properties: { status: { type: 'string' }, data: { type: 'integer' } }
  };
  assert.deepEqual(validate(s, { status: 'ok', message: 'hi', data: 1 }), []);
  assert.equal(validate(s, { message: 'hi' }).length, 1);
  assert.equal(validate(s, { status: 'ok', message: 'hi', data: 'no' }).length, 1);
});

test('string constraints', () => {
  assert.deepEqual(validate({ type: 'string', minLength: 2, maxLength: 4 }, 'abc'), []);
  assert.equal(validate({ type: 'string', minLength: 2 }, 'a').length, 1);
  assert.equal(validate({ type: 'string', maxLength: 4 }, 'abcde').length, 1);
  assert.deepEqual(validate({ type: 'string', pattern: '^[0-9A-HJKMNP-TV-Z]{8}$' }, 'ABCD1234'), []);
  assert.equal(validate({ type: 'string', pattern: '^[0-9A-HJKMNP-TV-Z]{8}$' }, 'o0I1lL!!').length, 1);
});

test('arrays: items + minItems', () => {
  const s = { type: 'array', minItems: 1, maxItems: 200, items: { type: 'string', minLength: 1 } };
  assert.deepEqual(validate(s, ['a', 'b']), []);
  assert.equal(validate(s, []).length, 1);
  assert.equal(validate(s, [1]).length, 1);
  assert.equal(validate(s, new Array(201).fill('x')).length, 1);
});

test('enum + const', () => {
  assert.deepEqual(validate({ enum: ['dns', 'ip'] }, 'dns'), []);
  assert.equal(validate({ enum: ['dns', 'ip'] }, 'ssl').length, 1);
  assert.equal(validate({ const: 'success' }, 'error').length, 1);
});

test('additionalProperties: false', () => {
  const s = { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false };
  assert.equal(validate(s, { a: 'x', b: 'y' }).length, 1);
  assert.deepEqual(validate(s, { a: 'x' }), []);
});

test('numeric bounds', () => {
  assert.deepEqual(validate({ type: 'number', minimum: 0, maximum: 100 }, 42), []);
  assert.equal(validate({ type: 'number', minimum: 0 }, -1).length, 1);
  assert.equal(validate({ type: 'number', maximum: 100 }, 101).length, 1);
});

test('anyOf / oneOf', () => {
  const any = { anyOf: [{ type: 'string' }, { type: 'null' }] };
  assert.deepEqual(validate(any, 'x'), []);
  assert.deepEqual(validate(any, null), []);
  assert.equal(validate(any, 5).length, 1);
  const one = { oneOf: [{ type: 'string' }, { type: 'number' }] };
  assert.deepEqual(validate(one, 'x'), []);
  assert.equal(validate({ oneOf: [{ type: 'string' }] }, 5).length, 1);
});

test('null schema / non-object passes through', () => {
  assert.deepEqual(validate(null, 'x'), []);
  assert.deepEqual(validate({}, 'anything'), []);
});
