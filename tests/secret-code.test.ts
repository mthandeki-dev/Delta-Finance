import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecretCode, parseSecretCode, verifySecret } from '../src/lib/secret-code';

test('secret code: generate → parse → verify', () => {
  const c = generateSecretCode();
  assert.match(c.display, /^DF-[A-Z2-9]{6}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  const parsed = parseSecretCode(` ${c.display.toLowerCase()} `);
  assert.ok(parsed);
  assert.equal(parsed.prefix, c.prefix);
  assert.equal(verifySecret(parsed.secret, c.salt, c.codeHash), true);
  assert.equal(verifySecret('AAAAA-AAAAA-AAAAA', c.salt, c.codeHash), false);
  assert.ok(!c.codeHash.includes(parsed.secret)); // only the hash is stored
});

test('secret code: malformed input is rejected', () => {
  assert.equal(parseSecretCode('hello'), null);
  assert.equal(parseSecretCode('DF-ABC-DEF'), null);
});
