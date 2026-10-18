import test from 'node:test';
import assert from 'node:assert';
import { acquireLock, withLock, readLock, forceReleaseLock } from '../src/lock.mjs';

test('lock system lifecycle: acquire, inspect, release, and auto-cleanup', async () => {
  forceReleaseLock();
  assert.strictEqual(readLock(), null, 'Lock should be clean');

  const lock1 = await acquireLock('test-agent-1');
  const state1 = readLock();
  assert.ok(state1);
  assert.strictEqual(state1.task, 'test-agent-1');
  assert.strictEqual(state1.pid, process.pid);

  lock1.release();
  assert.strictEqual(readLock(), null, 'Lock should be released');

  let ran = false;
  await withLock('test-helper', async () => {
    assert.notStrictEqual(readLock(), null, 'Lock must be active inside withLock');
    ran = true;
  });
  assert.strictEqual(ran, true, 'withLock must execute body');
  assert.strictEqual(readLock(), null, 'Lock must be released after withLock');
});

test('acquireLock recovers immediately from empty or corrupted lock file', async () => {
  forceReleaseLock();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { LOCK_FILE, LOCK_DIR } = await import('../src/lock.mjs');
  
  mkdirSync(LOCK_DIR, { recursive: true });
  writeFileSync(LOCK_FILE, '', 'utf8'); // 0-byte corrupt lock

  // Should recover immediately rather than timing out after 60s
  const start = Date.now();
  const lock = await acquireLock('recovery-test', 3000);
  const elapsed = Date.now() - start;

  assert.ok(lock);
  assert.ok(elapsed < 2500, `Expected instant recovery, took ${elapsed}ms`);
  lock.release();
});
