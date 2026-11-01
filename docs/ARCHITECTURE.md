# Architecture

A high-level blueprint of how `linkedin-ops` is designed. For the strict separation between tool code and personal user data, see [DATA_CONTRACT.md](../DATA_CONTRACT.md).

---

## 1. Principles

- **Local-first & Cloud-Free**: All automation runs directly against a local Google Chrome instance on your machine via Chrome DevTools Protocol (CDP). No third-party proxy, SaaS, or credential-relaying server.
- **Agent-Safe Concurrency**: Multiple autonomous agents (or CLI commands) can run concurrently without clobbering each other's sessions or stealing browser focus.
- **Fail-Closed & Ephemeral**: Every action runs inside its own isolated tab that is guaranteed to close on completion or failure.

---

## 2. Core Architectural Components

```
                   ┌──────────────────────────────────────┐
                   │   CLI Entry / User Campaign Script   │
                   └──────────────────┬───────────────────┘
                                      │
                         withLock('linkedin-task')
                                      │
                                      ▼
                   ┌──────────────────────────────────────┐
                   │         Cross-Process Mutex          │
                   │  (OS temp linkedin.lock + TTL check) │
                   └──────────────────┬───────────────────┘
                                      │
                     withDedicatedTab({ port: 9222 })
                                      │
                                      ▼
    ┌─────────────────────────── Ephemeral Tab Lifecycle ───────────────────────────┐
    │                                                                               │
    │  1. Check Port 9222 ──► If down, check SingletonLock ──► Auto-spawn Chrome    │
    │  2. Target Creation ──► PUT /json/new (spawns blank tab target)               │
    │  3. CDP WebSocket   ──► Direct connection to ws://localhost:9222/devtools...   │
    │  4. DOM Action      ──► connect / dm / comment / search                       │
    │  5. Cleanup         ──► finally: PUT /json/close/<targetId> (no zombie tabs)   │
    │                                                                               │
    └───────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Cross-Process Mutex Locking (`src/lock.mjs`)
LinkedIn detects and blocks rapid parallel actions. To prevent concurrent AI agents or shell scripts from triggering actions simultaneously, `withLock` acquires a local file-based mutex lock with:
- Monotonic timestamps to compute elapsed lock duration.
- Stale process detection using POSIX signals (`kill(pid, 0)`).
- Automatic recovery from empty or crashed lock files.

### 2.2 Runtime Browser Manager (`src/browser-manager.mjs`)
Solves the primary friction of CDP automation:
- **Binary Discovery**: Scans standard installation directories across macOS, Linux, and Windows for Google Chrome and Chromium.
- **Profile Discovery**: Reads Chrome's `Local State` JSON to list named profiles (`Default`, `Profile 1`, etc.) with user emails.
- **`SingletonLock` Detection**: Detects whether Chrome is already running on the profile without remote debugging enabled, prompting a clean restart rather than throwing a silent connection failure.

### 2.3 Ephemeral Dedicated Tabs (`src/tab-manager.mjs`)
Rather than commandeering the user's active browsing tab:
- Dispatches HTTP `PUT /json/new` to create a dedicated background tab.
- Attaches a low-level WebSocket connection to that specific target ID.
- Executes the action (e.g. `sendConnectionInvite`, `searchPeople`).
- Always destroys the tab via `PUT /json/close/<targetId>` in a `finally` block, eliminating memory leaks and zombie tabs.

### 2.4 Dom Actions & Auth Guards (`src/actions/`)
All action drivers navigate to canonical routes and verify session health before typing:
- Immediately detects authwalls and login redirects, returning `NOT_AUTHENTICATED` instead of timing out on missing selectors.
- Simulates natural input delays and element clicks.
- Supports dry-run execution by default; only submits when `--send` is explicitly supplied.
