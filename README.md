# linkedin-ops

High-reliability, multi-agent-safe LinkedIn automation engine and CLI built on Chrome DevTools Protocol (CDP).

---

## Quickstart (<30s Setup)

### 1. Install dependencies
```bash
npm install
```

### 2. Run automated setup
```bash
node index.mjs setup
```
The setup wizard automatically:
1. Locates your Google Chrome binary (macOS, Linux, Windows).
2. Discovers your existing Chrome profiles from system User Data so you can pick your logged-in account (or create a dedicated project session).
3. Saves settings to `.linkedin-opsrc` (no manual path pasting required).
4. Generates a one-click launcher (`start-chrome.command` / `start-chrome.bat`).

### 3. Verify session & connection
```bash
npm run doctor
# or: node index.mjs doctor
```
*Checks CDP port 9222 reachability, browser version, user agent, and verifies an authenticated LinkedIn session.*

### 4. Run your first dry run
```bash
node index.mjs connect --profile="https://www.linkedin.com/in/username" --note="Hi, loved your post on distributed systems..."
```
*(Dry-run mode navigates and fills the note without submitting. Add `--send` only when ready to live submit).*

---

## Architecture Guarantees

1. **Automated Runtime Fallback**: Daily commands ping port 9222. If Chrome is closed, `linkedin-ops` automatically launches it using your configured profile. If Chrome is already running without remote debugging enabled, it detects the profile lock and prompts to restart cleanly.
2. **Cross-Process Mutex Locking**: Serializes execution across concurrent agents and processes (`linkedin.lock`). Prevents session collisions, focus-stealing, and rate-limiting.
3. **Isolated Ephemeral Tabs**: Each operation spawns its own dedicated Chrome tab via `PUT /json/new` and connects directly via target ID.
4. **Auto-Cleanup**: Guarantees tab destruction (`/json/close/<targetId>`) in a `finally` block on success or failure, eliminating zombie tab leaks.

---

## CLI Usage

```bash
# Automated setup wizard
node index.mjs setup

# Pre-flight health check
node index.mjs doctor

# Connection invitation with personalized note (dry-run)
node index.mjs connect --profile="https://www.linkedin.com/in/username" --note="Hi, loved your post..."

# Live connection invitation
node index.mjs connect --profile="https://www.linkedin.com/in/username" --note="Hi, loved your post..." --send

# Direct message to 1st-degree connection
node index.mjs dm --profile="https://www.linkedin.com/in/username" --message="Checking in on our conversation." --send

# Comment on a LinkedIn post
node index.mjs comment --url="https://www.linkedin.com/posts/..." --text="Great insights on distributed systems!" --send

# Company people search (e.g. recruiters)
node index.mjs search --company="Google" --keywords="recruiter" --limit=10 --json

# Inspect or force-release active mutex lock
node index.mjs lock
node index.mjs lock release
```

---

## Programmatic Library Usage

```javascript
import { withLock, withDedicatedTab, sendConnectionInvite } from 'linkedin-ops';

await withLock('outreach-task', async () => {
  await withDedicatedTab({ port: 9222 }, async (cdp) => {
    const result = await sendConnectionInvite(cdp, {
      linkedinUrl: 'https://www.linkedin.com/in/username',
      note: 'Hi, loved your work on distributed systems.',
      send: true
    });
    console.log(result);
  });
});
```

---

## License

MIT
