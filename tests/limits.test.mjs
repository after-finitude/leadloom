import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../src/limits.mjs';

test('a window refuses requests over the limit until it expires', () => {
  const limits = new RateLimiter();
  limits.hit('login:a', 2, 1000, 0);
  limits.hit('login:a', 2, 1000, 500);
  assert.throws(() => limits.hit('login:a', 2, 1000, 999), { status: 429 });
  limits.hit('login:b', 2, 1000, 999);
  limits.hit('login:a', 2, 1000, 1000);
});

test('memory stays bounded: expired windows go first, then the oldest live ones', () => {
  const limits = new RateLimiter(10);
  for (let i = 0; i < 5; i++) limits.hit(`old:${i}`, 1, 100, 0);
  for (let i = 0; i < 5; i++) limits.hit(`live:${i}`, 1, 10000, 50);
  limits.hit('new', 1, 10000, 200);
  assert.equal(limits.windows.size, 6);
  assert.ok(!limits.windows.has('old:0'));
  for (let i = 5; i < 20; i++) limits.hit(`live:${i}`, 1, 10000, 300);
  assert.ok(limits.windows.size <= 10);
  assert.ok(!limits.windows.has('live:0'));
  assert.ok(limits.windows.has('live:19'));
});
