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
