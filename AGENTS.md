# Agent Guidelines & Project Invariants

`linkedin-ops` is a high-reliability, multi-agent-safe LinkedIn automation engine and CLI built on Chrome DevTools Protocol (CDP).

---

## 1. Documentation & Superpowers Plan Locations

- **Design & Architecture Specs**: ALWAYS save to `docs/specs/YYYY-MM-DD-<topic>-design.md`.
- **Execution & Implementation Plans**: ALWAYS save to `docs/plans/YYYY-MM-DD-<feature-name>.md`.
- **Banned Directories**: NEVER create or write to `docs/superpowers/` or `.superpowers/`.

---

## 2. System vs User Layer Boundaries (Data Contract)

Follow [DATA_CONTRACT.md](DATA_CONTRACT.md) strictly:

- **System Layer (Version-controlled)**: `src/`, `test/`, `docs/`, `index.mjs`, `package.json`, `LICENSE`, `README.md`, `DATA_CONTRACT.md`, `campaigns/*.example.mjs`.
- **User Layer (Strictly Gitignored)**:
  - Local configuration: `.linkedin-opsrc`, `start-chrome.*`
  - Harvested datasets & leads: `data/*` (except `data/.gitkeep`)
  - User campaigns: `campaigns/*.mjs` (except `campaigns/*.example.mjs` and `campaigns/.gitkeep`)
  - Ad-hoc test/scratch scripts: `scratch/*` (except `scratch/.gitkeep`)
- NEVER commit personal LinkedIn profile URLs, recruiter lead lists, or campaign outputs to git.

---

## 3. Architecture & CDP Invariants

- **Isolated Tab Lifecycles**: All actions must spawn dedicated background tabs via `PUT /json/new` and clean them up inside a `finally` block via `PUT /json/close/<targetId>`. Never commandeer existing browser tabs.
- **Mutex Serialization**: Wrap all automated browser operations with `withLock(taskName, fn)`. Never bypass mutex locks in production workflows.
- **Dry-Run by Default**: Actions must default to dry-run mode (navigation, verification, note insertion). Live submission must strictly require an explicit `--send` flag or `send: true` argument.
- **Immediate Auth Guards**: Check for login/authwall redirects upon navigation and fail early with `NOT_AUTHENTICATED`. Do not wait for DOM selectors on unauthenticated pages.
- **Zero Heavy External Dependencies**: Core engine relies solely on native Node.js ESM modules (`fetch`, `child_process`, `readline`, `fs`, `node:test`). Do not add Puppeteer, Playwright, or large automation frameworks to core dependencies.

---

## 4. Verification & Testing

- Before completing any task or committing code, run the unit test suite:
  ```bash
  npm test
  ```
- All tests must pass cleanly with 0 failures before creating a commit or PR.
