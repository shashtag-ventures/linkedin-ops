import test from 'node:test';
import assert from 'node:assert';
import { existsSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig, getConfigPath } from '../src/lock.mjs';

test('loadConfig and saveConfig work in isolated scope', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-config-'));
  const tempConfigPath = join(tempDir, '.test-linkedin-opsrc');
  const sample = { cdpPort: 9222, profileDir: 'Default', chromePath: '/Applications/Google Chrome.app' };
  
  saveConfig(sample, tempConfigPath);
  const loaded = loadConfig(tempConfigPath);
  assert.strictEqual(loaded.cdpPort, 9222);
  assert.strictEqual(loaded.profileDir, 'Default');
  assert.strictEqual(loaded.chromePath, '/Applications/Google Chrome.app');
  
  rmSync(tempDir, { recursive: true, force: true });
});

test('loadConfig returns empty object when config does not exist', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'test-config-none-'));
  const tempConfigPath = join(tempDir, 'nonexistent-config');
  const config = loadConfig(tempConfigPath);
  assert.deepStrictEqual(config, {});
  rmSync(tempDir, { recursive: true, force: true });
});
