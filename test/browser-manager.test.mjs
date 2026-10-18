import test from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getChromeBinaryPath,
  getSystemUserDataDir,
  discoverProfiles,
  checkProfileLock,
} from '../src/browser-manager.mjs';

test('detects chrome binary and system user data directory on current platform', () => {
  const binary = getChromeBinaryPath();
  assert.ok(typeof binary === 'string' || binary === null);
  const dataDir = getSystemUserDataDir();
  assert.ok(typeof dataDir === 'string' || dataDir === null);
});

test('getChromeBinaryPath returns appropriate candidate paths per platform', () => {
  const macPath = getChromeBinaryPath('darwin');
  assert.strictEqual(macPath, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  
  const linuxPath = getChromeBinaryPath('linux');
  assert.ok(linuxPath === '/usr/bin/google-chrome' || linuxPath === '/usr/bin/chromium' || linuxPath === null);

  const winPath = getChromeBinaryPath('win32');
  assert.ok(typeof winPath === 'string' || winPath === null);
});

test('discoverProfiles parses Local State correctly', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'chrome-user-data-'));
  const localStateContent = {
    profile: {
      info_cache: {
        Default: {
          name: 'Personal Account',
          user_name: 'test@example.com',
          is_using_default_name: false,
        },
        'Profile 1': {
          name: 'Work Account',
          user_name: 'work@company.com',
          is_using_default_name: false,
        }
      }
    }
  };
  writeFileSync(join(tempDir, 'Local State'), JSON.stringify(localStateContent), 'utf8');

  const profiles = discoverProfiles(tempDir);
  assert.strictEqual(profiles.length, 2);
  
  const defaultProf = profiles.find((p) => p.id === 'Default');
  assert.ok(defaultProf);
  assert.strictEqual(defaultProf.name, 'Personal Account');
  assert.strictEqual(defaultProf.email, 'test@example.com');
  assert.strictEqual(defaultProf.isDefault, true);

  const workProf = profiles.find((p) => p.id === 'Profile 1');
  assert.ok(workProf);
  assert.strictEqual(workProf.name, 'Work Account');
  assert.strictEqual(workProf.email, 'work@company.com');
  assert.strictEqual(workProf.isDefault, false);

  rmSync(tempDir, { recursive: true, force: true });
});

test('checkProfileLock detects active and inactive SingletonLock', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'chrome-lock-test-'));
  
  // No lock file
  assert.deepStrictEqual(checkProfileLock(tempDir), { isLocked: false, pid: null });

  // Mock active process lock with our current PID
  writeFileSync(join(tempDir, 'SingletonLock'), String(process.pid), 'utf8');
  const lockedState = checkProfileLock(tempDir);
  assert.strictEqual(lockedState.isLocked, true);
  assert.strictEqual(lockedState.pid, process.pid);

  // Mock inactive lock with non-existent high PID
  writeFileSync(join(tempDir, 'SingletonLock'), '999999999', 'utf8');
  const inactiveState = checkProfileLock(tempDir);
  assert.strictEqual(inactiveState.isLocked, false);

  rmSync(tempDir, { recursive: true, force: true });
});
