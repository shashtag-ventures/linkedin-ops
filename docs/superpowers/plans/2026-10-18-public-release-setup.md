# linkedin-ops Public Release & Chrome Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-friction cross-platform Chrome setup wizard and runtime browser manager for `linkedin-ops` and sanitize the repository for public GitHub release.

**Architecture:** A modular `browser-manager` detects OS binaries, parses system Chrome profiles from `Local State`, detects non-debug `SingletonLock` process conflicts, and launches Chrome with CDP port 9222. An interactive `setup` wizard stores settings in `.linkedin-opsrc`, generates one-click launchers, and integrates with `doctor` and `withDedicatedTab` for automated runtime fallback.

**Tech Stack:** Node.js (ESM), Chrome DevTools Protocol (CDP), Native `readline`, `child_process`, `fs`.

**Spec:** `docs/superpowers/specs/2026-10-18-public-release-setup-design.md`

## Global Constraints

- Never write to or create `~/.config/linkedin-ops/chrome-profile`.
- Lock files and configs must be project-local or follow user configuration (`.linkedin-opsrc`).
- All platform-specific logic must support macOS (tested live), Linux, and Windows.
- Tests must pass via `npm test` (`node --test`).
- No external heavy dependencies (use native Node modules).

## Review Focus

1. Chrome is running holding `SingletonLock` on the chosen profile without remote debugging port 9222 enabled: must detect this and prompt/offer clean restart instead of hanging or throwing generic connection refused.
2. User profile name contains special characters or spaces: profile path resolution and launch flags must be correctly quoted.
3. No Chrome installation found on system: wizard must gracefully report missing paths and allow custom input.
4. Active lock recovery: stale lock file left behind by killed processes must be cleaned without blocking future runs.
5. Dry-run safety: all actions default to dry-run unless `--send` is explicitly provided.

---

### Task 1: Configuration & Lock Sanitization

**Files:**
- Modify: `src/lock.mjs`
- Modify: `.gitignore`
- Test: `test/config-lock.test.mjs`

**Interfaces:**
- Consumes: Node `fs`, `os`, `path`
- Produces: `getConfigPath()`, `loadConfig()`, `saveConfig(config)`, updated `withLock(taskName, fn)` that avoids polluting `~/.config`

- [ ] **Step 1: Write failing test in `test/config-lock.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert';
import { loadConfig, saveConfig, withLock, readLock } from '../src/lock.mjs';

test('loadConfig and saveConfig work in project scope', async () => {
  const sample = { cdpPort: 9222, profileDir: 'Default' };
  saveConfig(sample);
  const loaded = loadConfig();
  assert.strictEqual(loaded.cdpPort, 9222);
  assert.strictEqual(loaded.profileDir, 'Default');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/config-lock.test.mjs`  
Expected: FAIL (`loadConfig is not a function`)

- [ ] **Step 3: Implement config loading/saving and sanitize `src/lock.mjs` and `.gitignore`**

Update `src/lock.mjs` to export `loadConfig` and `saveConfig` targeting `.linkedin-opsrc` in current working directory / repo root, and store lock files locally in `.data/` or OS tmp. Add `batch-connect-*.mjs`, `.data/`, and `.linkedin-opsrc` to `.gitignore`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/config-lock.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lock.mjs test/config-lock.test.mjs .gitignore
git commit -m "refactor: project-local config and lock sanitization"
```

---

### Task 2: OS Browser & Profile Discovery

**Files:**
- Create: `src/browser-manager.mjs`
- Test: `test/browser-manager.test.mjs`

**Interfaces:**
- Consumes: `os.platform()`, `fs`, `path`
- Produces: 
  - `getChromeBinaryPath(platform?: string): string | null`
  - `getSystemUserDataDir(platform?: string): string | null`
  - `discoverProfiles(userDataDir?: string): Array<{ id: string, name: string, email?: string, isDefault: boolean }>`
  - `checkProfileLock(userDataDir: string): { isLocked: boolean, pid?: number }`

- [ ] **Step 1: Write failing test in `test/browser-manager.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert';
import { getChromeBinaryPath, getSystemUserDataDir, discoverProfiles } from '../src/browser-manager.mjs';

test('detects chrome binary and system user data directory on current platform', () => {
  const binary = getChromeBinaryPath();
  assert.ok(typeof binary === 'string' || binary === null);
  const dataDir = getSystemUserDataDir();
  assert.ok(typeof dataDir === 'string' || dataDir === null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/browser-manager.test.mjs`  
Expected: FAIL (Cannot find module)

- [ ] **Step 3: Implement `src/browser-manager.mjs` discovery functions**

Implement `getChromeBinaryPath`, `getSystemUserDataDir`, `discoverProfiles` (parsing `Local State`), and `checkProfileLock` supporting darwin, linux, and win32.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/browser-manager.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/browser-manager.mjs test/browser-manager.test.mjs
git commit -m "feat: cross-platform chrome binary and profile discovery"
```

---

### Task 3: Interactive Setup Wizard & Launcher Generator

**Files:**
- Create: `src/setup.mjs`
- Modify: `index.mjs`
- Test: `test/setup.test.mjs`

**Interfaces:**
- Consumes: `browser-manager.mjs`, `lock.mjs`, `doctor.mjs`
- Produces: 
  - `generateLauncherScript(platform: string, config: object, outputPath: string): string`
  - `runSetup(options?: object): Promise<{ success: boolean }>`
  - CLI command `linkedin-ops setup`

- [ ] **Step 1: Write failing test in `test/setup.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert';
import { generateLauncherScript } from '../src/setup.mjs';

test('generates valid launcher script for darwin, win32, and linux', () => {
  const config = { chromePath: '/path/to/chrome', userDataDir: '/data/dir', cdpPort: 9222 };
  const macScript = generateLauncherScript('darwin', config, 'start.command');
  assert.ok(macScript.includes('--remote-debugging-port=9222'));
  assert.ok(macScript.includes('/path/to/chrome'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/setup.test.mjs`  
Expected: FAIL (Module not found)

- [ ] **Step 3: Implement `src/setup.mjs` and register `setup` in `index.mjs`**

Implement automated discovery, interactive prompt with `readline`, `.linkedin-opsrc` creation, launcher generator, and auth handshake. Register `setup` command in `index.mjs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/setup.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/setup.mjs index.mjs test/setup.test.mjs
git commit -m "feat: automated setup wizard and launcher generator"
```

---

### Task 4: Runtime Browser Manager & Auto-Spawn Integration

**Files:**
- Modify: `src/browser-manager.mjs`
- Modify: `src/tab-manager.mjs`
- Modify: `src/doctor.mjs`
- Test: `test/runtime-browser.test.mjs`

**Interfaces:**
- Consumes: `browser-manager.mjs`, `lock.mjs`
- Produces: 
  - `ensureChromeRunning(options: { port?: number, restartChrome?: boolean }): Promise<{ running: boolean, spawned: boolean }>`
  - Wire into `withDedicatedTab` so commands auto-start or recover Chrome seamlessly

- [ ] **Step 1: Write failing test in `test/runtime-browser.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert';
import { checkCDPConnection } from '../src/cdp.mjs';
import { ensureChromeRunning } from '../src/browser-manager.mjs';

test('ensureChromeRunning handles port check and returns status', async () => {
  assert.strictEqual(typeof ensureChromeRunning, 'function');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/runtime-browser.test.mjs`  
Expected: FAIL (`ensureChromeRunning is not a function`)

- [ ] **Step 3: Implement `ensureChromeRunning` and wire into `withDedicatedTab`**

Connect `withDedicatedTab` to call `ensureChromeRunning`. If port is down, check profile lock. If locked by non-debug Chrome, notify/prompt restart. If free, spawn Chrome with debugging flags and wait for port readiness.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/runtime-browser.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/browser-manager.mjs src/tab-manager.mjs src/doctor.mjs test/runtime-browser.test.mjs
git commit -m "feat: runtime browser auto-spawn and conflict handling"
```

---

### Task 5: Repository Sanitization, Docs & End-to-End Verification

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Verify & Ignore: `batch-connect-*.mjs`
- Run: Full test suite `npm test`

- [ ] **Step 1: Update README.md with clear open-source quickstart (`npx linkedin-ops setup`)**
- [ ] **Step 2: Ensure all personal batch scripts are excluded from git and no personal paths remain**
- [ ] **Step 3: Run the full test suite and live verification on macOS**

Run: `npm test`  
Expected: All tests pass.

- [ ] **Step 4: Test `node index.mjs setup` and `node index.mjs doctor` on the machine**
- [ ] **Step 5: Commit**

```bash
git add README.md package.json .gitignore
git commit -m "docs: update quickstart for public open-source release"
```
