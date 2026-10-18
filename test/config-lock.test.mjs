import test from 'node:test';
import assert from 'node:assert';
import { existsSync, unlinkSync } from 'node:fs';
import { loadConfig, saveConfig, getConfigPath, withLock, readLock, forceReleaseLock } from '../src/lock.mjs';

test('loadConfig and saveConfig work in project scope', async () => {
  const configPath = getConfigPath();
  const sample = { cdpPort: 9222, profileDir: 'Default', chromePath: '/Applications/Google Chrome.app' };
  
  saveConfig(sample);
  const loaded = loadConfig();
  assert.strictEqual(loaded.cdpPort, 9222);
  assert.strictEqual(loaded.profileDir, 'Default');
  assert.strictEqual(loaded.chromePath, '/Applications/Google Chrome.app');
  
  if (existsSync(configPath)) {
    unlinkSync(configPath);
  }
});

test('withLock acquires and releases lock without throwing', async () => {
  forceReleaseLock();
  let ran = false;
  await withLock('test-task', async () => {
    ran = true;
    const lock = readLock();
    assert.ok(lock);
    assert.strictEqual(lock.task, 'test-task');
  });
  assert.strictEqual(ran, true);
  assert.strictEqual(readLock(), null);
});
