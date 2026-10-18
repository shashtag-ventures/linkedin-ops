import test from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateLauncherScript, writeLauncherFile } from '../src/setup.mjs';

test('generates valid launcher script for darwin, win32, and linux', () => {
  const config = {
    chromePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: '/Users/test/Library/Application Support/Google/Chrome',
    profileDir: 'Default',
    cdpPort: 9222,
  };

  // macOS
  const macScript = generateLauncherScript('darwin', config);
  assert.ok(macScript.includes('--remote-debugging-port=9222'));
  assert.ok(macScript.includes('/Applications/Google Chrome.app'));
  assert.ok(macScript.includes('--user-data-dir='));
  assert.ok(macScript.includes('--profile-directory="Default"'));

  // Windows
  const winConfig = {
    chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    userDataDir: 'C:\\Users\\test\\AppData\\Local\\Google\\Chrome\\User Data',
    profileDir: 'Profile 1',
    cdpPort: 9222,
  };
  const winScript = generateLauncherScript('win32', winConfig);
  assert.ok(winScript.includes('--remote-debugging-port=9222'));
  assert.ok(winScript.includes('chrome.exe'));
  assert.ok(winScript.includes('--profile-directory="Profile 1"'));

  // Linux
  const linuxConfig = {
    chromePath: '/usr/bin/google-chrome',
    userDataDir: '/home/test/.config/google-chrome',
    profileDir: 'Default',
    cdpPort: 9222,
  };
  const linuxScript = generateLauncherScript('linux', linuxConfig);
  assert.ok(linuxScript.includes('--remote-debugging-port=9222'));
  assert.ok(linuxScript.includes('/usr/bin/google-chrome'));
});

test('writeLauncherFile creates executable script on disk', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'launcher-test-'));
  const targetFile = join(tempDir, 'launch-chrome.command');
  const config = {
    chromePath: '/Applications/Google Chrome.app',
    userDataDir: '/data',
    cdpPort: 9222,
  };

  const writtenPath = writeLauncherFile('darwin', config, targetFile);
  assert.strictEqual(writtenPath, targetFile);
  assert.ok(existsSync(targetFile));

  const content = readFileSync(targetFile, 'utf8');
  assert.ok(content.includes('--remote-debugging-port=9222'));

  rmSync(tempDir, { recursive: true, force: true });
});
