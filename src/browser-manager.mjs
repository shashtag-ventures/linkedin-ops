/**
 * browser-manager.mjs — Cross-Platform Chrome & Profile Management
 * 
 * Provides automated discovery of Google Chrome binaries, user profiles,
 * process lock detection, and runtime startup handlers.
 */

import { existsSync, readFileSync, readdirSync, readlinkSync, lstatSync } from 'fs';
import { resolve, join } from 'path';
import { homedir, platform as getOsPlatform } from 'os';

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
  if (!existsSync(lockPath)) {
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
