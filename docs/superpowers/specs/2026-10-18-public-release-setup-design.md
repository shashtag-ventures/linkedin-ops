# linkedin-ops Public Release & Chrome Setup Architecture Design

**Date:** 2026-10-18  
**Author:** Antigravity & Shashwat Gupta  
**Status:** Approved  
**Repository:** `https://github.com/shashtag-ventures/linkedin-ops`

---

## 1. Intent & Purpose

`linkedin-ops` is an automation engine and CLI for LinkedIn built on Chrome DevTools Protocol (CDP). It allows users and autonomous agents to perform high-reliability LinkedIn actions (connection requests with notes, direct messages, comments, search, and diagnostics) with cross-process locking and isolated tab lifecycles.

To make the repository public on GitHub, the tool must solve the primary user onboarding hurdle: launching and connecting to Google Chrome on remote debugging port 9222 without requiring users to manually copy-paste terminal flags, locate hidden file paths, or manage browser profiles by hand.

---

## 2. Core Goals & Non-Goals

### Goals
1. **Zero-Friction Automated Setup (`linkedin-ops setup`)**:
   - Detect the OS (macOS, Linux, Windows) and find the Chrome binary.
   - Auto-discover existing Chrome profiles by reading `Local State` in the system Chrome directory.
   - Present a numbered interactive selection (e.g. `[1] Default (Personal)`, `[2] Profile 1 (Work)`, `[3] Dedicated project profile (./.data/session)`).
   - Write the chosen configuration to a local `.linkedin-opsrc` file in the project root.
   - Check authentication against LinkedIn and confirm setup.
2. **Runtime Browser Manager**:
   - When executing commands (`connect`, `dm`, `doctor`), ping port 9222.
   - If port 9222 is dead, check if the configured profile is actively locked by a running non-debug Chrome instance (`SingletonLock`).
   - If locked without debugging, prompt the user to restart Chrome with debugging (preserving tabs) or support `--restart-chrome` non-interactively.
   - If closed, auto-spawn Chrome with the configured profile and proceed cleanly.
3. **One-Click Desktop Launcher**:
   - Offer to generate an OS-specific shortcut (macOS `.command`, Windows `.bat`, Linux `.desktop`) to launch Chrome on port 9222 in one click.
4. **Repository Sanitization for Open Source**:
   - Eliminate hardcoded `~/.config/linkedin-ops/chrome-profile` references.
   - Move mutex locks to project-local or standard temporary storage without creating unwanted directories in `~/.config`.
   - Ensure personal campaigns (`batch-connect-*.mjs`, personal recruiter lists) are excluded from git.
   - Update README and CLI documentation.

### Non-Goals & Anti-Goals
- **Anti-Goal**: Do NOT create unwanted profiles in `~/.config/linkedin-ops/chrome-profile`.
- **Anti-Goal**: Do NOT silently crash when Chrome is open without debugging; detect `SingletonLock` and handle it explicitly.
- **Non-Goal**: Web UI / Electron app. Keep it a clean, dependency-light Node.js CLI.

---

## 3. Architecture & Components

### 3.1 Profile & Browser Detection (`src/browser-manager.mjs`)
- **OS Chrome Binary Locations**:
  - macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  - Linux: `/usr/bin/google-chrome`, `/usr/bin/chromium-browser`, `/snap/bin/chromium`
  - Windows: `%ProgramFiles%\Google\Chrome\Application\chrome.exe`, `%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe`, `%LocalAppData%\Google\Chrome\Application\chrome.exe`
- **System Profile Discovery**:
  - macOS: `~/Library/Application Support/Google/Chrome`
  - Linux: `~/.config/google-chrome`
  - Windows: `%LOCALAPPDATA%\Google\Chrome\User Data`
  - Parses `<UserData>/Local State` JSON -> `profile.info_cache` to extract display names and emails.
- **Lock & Process Detection**:
  - Checks if `<UserData>/SingletonLock` exists and whether the referenced PID is active.

### 3.2 Configuration Storage (`.linkedin-opsrc`)
Stores:
```json
{
  "cdpPort": 9222,
  "chromePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "userDataDir": "/Users/.../Library/Application Support/Google/Chrome",
  "profileDir": "Default"
}
```

### 3.3 Setup Wizard (`src/setup.mjs`)
- Runs interactively with Node `readline`.
- Step 1: Detect Chrome.
- Step 2: List discovered profiles + project-local option.
- Step 3: Check port 9222 / active locks.
- Step 4: Write `.linkedin-opsrc`.
- Step 5: Optionally create desktop launcher.
- Step 6: Test launch and verify LinkedIn session.

### 3.4 Command Integration & Doctor
- `index.mjs setup`: invokes setup wizard.
- `index.mjs doctor`: validates binary, config, port 9222, CDP protocol, and LinkedIn login state.
- `src/tab-manager.mjs`: calls `ensureChromeRunning()` before attempting `PUT /json/new`.
