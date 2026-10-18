/**
 * lock.mjs — Cross-Process Mutex Lock & Configuration for LinkedIn Automation
 * 
 * Guarantees serial execution across multiple agents and processes.
 * Prevents race conditions, focus-stealing, and account rate-limiting.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { tmpdir } from 'os';

export const CONFIG_FILE = resolve(process.cwd(), '.linkedin-opsrc');

export function getConfigPath() {
  return CONFIG_FILE;
}

export function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

export function saveConfig(config) {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  return config;
}

// Store locks in OS temp or project .data to prevent ~/.config pollution
const LOCK_DIR = resolve(tmpdir(), 'linkedin-ops-lock');
const LOCK_FILE = resolve(LOCK_DIR, 'linkedin.lock');
const DEFAULT_TIMEOUT_MS = 60000; // 60s max wait for lock
const STALE_LOCK_MS = 90000; // 90s lock auto-expiration (if process crashed)

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isProcessAlive(pid) {
  try {
    return process.kill(pid, 0);
  } catch (e) {
    return e.code === 'EPERM'; // Process exists but no permission
  }
}

export function readLock() {
  try {
    if (!existsSync(LOCK_FILE)) return null;
    const content = readFileSync(LOCK_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function forceReleaseLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      unlinkSync(LOCK_FILE);
      return true;
    }
  } catch {}
  return false;
}

export async function acquireLock(taskName = 'linkedin-task', maxWaitMs = DEFAULT_TIMEOUT_MS) {
  mkdirSync(LOCK_DIR, { recursive: true });
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const existingLock = readLock();

    if (existingLock) {
      const now = Date.now();
      const isStale = (now - existingLock.timestamp) > STALE_LOCK_MS;
      const alive = existingLock.pid ? isProcessAlive(existingLock.pid) : false;

      if (isStale || !alive) {
        console.warn(`[Lock] ⚠️ Recovering stale/dead lock held by PID ${existingLock.pid} (${existingLock.task})`);
        forceReleaseLock();
      } else {
        const elapsed = Math.round((now - existingLock.timestamp) / 1000);
        console.log(`[Lock] ⏳ Waiting for lock held by PID ${existingLock.pid} (${existingLock.task}, running ${elapsed}s)...`);
        await delay(1500);
        continue;
      }
    }

    try {
      const lockData = {
        pid: process.pid,
        task: taskName,
        timestamp: Date.now(),
        nodeVersion: process.version,
      };
      writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2), { flag: 'wx' });
      
      // Setup auto-cleanup on exit
      const cleanup = () => {
        try {
          const current = readLock();
          if (current && current.pid === process.pid) {
            unlinkSync(LOCK_FILE);
          }
        } catch {}
      };

      process.once('exit', cleanup);
      process.once('SIGINT', () => { cleanup(); process.exit(130); });
      process.once('SIGTERM', () => { cleanup(); process.exit(143); });

      return {
        release() {
          cleanup();
        }
      };
    } catch (err) {
      if (err.code === 'EEXIST') {
        await delay(1000);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`[Lock] ❌ Timeout acquiring LinkedIn lock after ${maxWaitMs / 1000}s. Another agent is running.`);
}

export async function withLock(taskName, fn, maxWaitMs = DEFAULT_TIMEOUT_MS) {
  const lock = await acquireLock(taskName, maxWaitMs);
  try {
    return await fn();
  } finally {
    lock.release();
  }
}
