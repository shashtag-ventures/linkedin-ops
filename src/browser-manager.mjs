/**
 * browser-manager.mjs — Cross-Platform Chrome & Profile Management
 * 
 * Provides automated discovery of Google Chrome binaries, user profiles,
 * process lock detection, and runtime startup handlers.
 */

import { existsSync, readFileSync, readdirSync, readlinkSync, lstatSync } from 'fs';
import { resolve, join } from 'path';
import { homedir, platform as getOsPlatform } from 'os';
import { spawn } from 'child_process';
import { loadConfig } from './lock.mjs';

/**
 * Check if Chrome CDP HTTP endpoint is responding on the given port
 */
export async function checkCDPConnection(port = 9222) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Locate Chrome binary on the host operating system
 */
export function getChromeBinaryPath(targetPlatform = getOsPlatform()) {
  const home = homedir();

  if (targetPlatform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return candidates[0]; // fallback candidate
  }

  if (targetPlatform === 'linux') {
    const candidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return candidates[0];
  }

  if (targetPlatform === 'win32') {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env['LOCALAPPDATA'] || join(home, 'AppData\\Local');

    const candidates = [
      join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
      join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
      join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return candidates[0];
  }

  return null;
}

/**
 * Locate default Chrome User Data directory on the host OS
 */
export function getSystemUserDataDir(targetPlatform = getOsPlatform()) {
  const home = homedir();

  if (targetPlatform === 'darwin') {
    const p = join(home, 'Library/Application Support/Google/Chrome');
    return p;
  }

  if (targetPlatform === 'linux') {
    const p = join(home, '.config/google-chrome');
    return p;
  }

  if (targetPlatform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] || join(home, 'AppData\\Local');
    return join(localAppData, 'Google\\Chrome\\User Data');
  }

  return null;
}

/**
 * Discover user profiles inside Chrome User Data directory
 */
export function discoverProfiles(userDataDir = getSystemUserDataDir()) {
  const results = [];
  if (!userDataDir || !existsSync(userDataDir)) {
    return results;
  }

  const localStatePath = join(userDataDir, 'Local State');
  if (existsSync(localStatePath)) {
    try {
      const raw = readFileSync(localStatePath, 'utf8');
      const data = JSON.parse(raw);
      const infoCache = data?.profile?.info_cache;

      if (infoCache && typeof infoCache === 'object') {
        for (const [profKey, profInfo] of Object.entries(infoCache)) {
          results.push({
            id: profKey,
            name: profInfo.name || profKey,
            email: profInfo.user_name || undefined,
            isDefault: profKey === 'Default',
          });
        }
      }
    } catch {}
  }

  // Fallback: Check directory entries if Local State parsing yielded nothing
  if (results.length === 0) {
    try {
      const entries = readdirSync(userDataDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && (entry.name === 'Default' || /^Profile \d+$/i.test(entry.name))) {
          results.push({
            id: entry.name,
            name: entry.name,
            isDefault: entry.name === 'Default',
          });
        }
      }
    } catch {}
  }

  return results;
}

/**
 * Check if Chrome is actively running and holding SingletonLock on the profile
 */
export function checkProfileLock(userDataDir) {
  if (!userDataDir || !existsSync(userDataDir)) {
    return { isLocked: false, pid: null };
  }

  const lockPath = join(userDataDir, 'SingletonLock');
  let stat;
  try {
    stat = lstatSync(lockPath);
  } catch {
    return { isLocked: false, pid: null };
  }

  try {
    let pid = null;
    const stat = lstatSync(lockPath);

    if (stat.isSymbolicLink()) {
      const target = readlinkSync(lockPath);
      // macOS/Linux target is often hostname-pid or pid
      const parts = target.split('-');
      const candidatePid = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(candidatePid)) pid = candidatePid;
    } else {
      const content = readFileSync(lockPath, 'utf8').trim();
      const candidatePid = parseInt(content, 10);
      if (!isNaN(candidatePid)) pid = candidatePid;
    }

    if (pid) {
      try {
        process.kill(pid, 0); // checks if process exists
        return { isLocked: true, pid };
      } catch (err) {
        if (err.code === 'EPERM') {
          return { isLocked: true, pid };
        }
      }
    }
  } catch {}

  return { isLocked: false, pid: null };
}

/**
 * Ensure Chrome is running on debugging port, auto-launching if needed
 */
export async function ensureChromeRunning(options = {}) {
  const port = options.port || 9222;
  const isAlive = await checkCDPConnection(port);
  if (isAlive) {
    return { running: true, spawned: false };
  }

  if (options.autoSpawn === false) {
    return { running: false, error: 'PORT_UNREACHABLE' };
  }

  const config = loadConfig();
  const chromePath = options.chromePath || config.chromePath || getChromeBinaryPath();
  const userDataDir = options.userDataDir || config.userDataDir || getSystemUserDataDir();
  const profileDir = options.profileDir !== undefined ? options.profileDir : config.profileDir;

  if (!chromePath || !existsSync(chromePath) || !userDataDir) {
    return { running: false, error: 'NO_CONFIG' };
  }

  // Check if profile is locked by another Chrome instance without debugging
  const lock = checkProfileLock(userDataDir);
  if (lock.isLocked) {
    if (options.restartChrome) {
      try {
        process.kill(lock.pid, 'SIGTERM');
        await new Promise((r) => setTimeout(r, 1200));
      } catch {}
    } else {
      return {
        running: false,
        error: 'PROFILE_LOCKED_WITHOUT_DEBUG',
        pid: lock.pid,
        userDataDir,
      };
    }
  }

  // Spawn Chrome detached with remote debugging
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (profileDir) {
    args.push(`--profile-directory=${profileDir}`);
  }

  try {
    const child = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    // Poll for port readiness
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 300));
      if (await checkCDPConnection(port)) {
        return { running: true, spawned: true };
      }
    }
  } catch (err) {
    return { running: false, error: 'SPAWN_FAILED', details: err.message };
  }

  return { running: false, error: 'SPAWN_TIMEOUT' };
}
