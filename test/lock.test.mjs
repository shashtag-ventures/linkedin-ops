import { acquireLock, withLock, readLock, forceReleaseLock } from '../src/lock.mjs';
import assert from 'assert';

console.log('Testing Lock System...');

// 1. Clean previous state
forceReleaseLock();
assert.strictEqual(readLock(), null, 'Lock should be clean');

// 2. Acquire lock
const lock1 = await acquireLock('test-agent-1');
const state1 = readLock();
assert.strictEqual(state1.task, 'test-agent-1', 'Lock should record task');
assert.strictEqual(state1.pid, process.pid, 'Lock should record PID');

// 3. Release lock
lock1.release();
assert.strictEqual(readLock(), null, 'Lock should be released');

// 4. Test withLock helper
let ran = false;
await withLock('test-helper', async () => {
  assert.notStrictEqual(readLock(), null, 'Lock must be active inside withLock');
  ran = true;
});
assert.strictEqual(ran, true, 'withLock must execute body');
assert.strictEqual(readLock(), null, 'Lock must be released after withLock');

console.log('✅ Lock System Tests Passed!');
