import test from 'node:test';
import assert from 'node:assert';
import { existsSync, unlinkSync } from 'node:fs';
import { loadConfig, saveConfig, getConfigPath } from '../src/lock.mjs';

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

test('loadConfig returns empty object when config does not exist', () => {
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    unlinkSync(configPath);
  }
  const config = loadConfig();
  assert.deepStrictEqual(config, {});
});
