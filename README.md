# linkedin-ops

High-reliability, multi-agent-safe LinkedIn automation engine and CLI built on Chrome DevTools Protocol (CDP).

> **Disclaimer & Responsible Use**: `linkedin-ops` is an independent open-source tool built for developer automation research, testing, and workflow automation via local Chrome DevTools Protocol (CDP). This project is not affiliated with, endorsed by, or sponsored by LinkedIn Corporation. Automated interaction with LinkedIn must comply with applicable platform terms and policies. Always maintain realistic human delays and respect LinkedIn rate limits to safeguard account health.

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

## Batch Campaigns

For multi-profile outreach and candidate sweeps, see [`campaigns/batch-connect.example.mjs`](campaigns/batch-connect.example.mjs):
```bash
# Copy template to your personal user campaigns folder
cp campaigns/batch-connect.example.mjs campaigns/my-outreach.mjs

# Run the campaign safely with mutex locking and isolated tab lifecycles
node campaigns/my-outreach.mjs
```
*(User campaigns and harvested datasets in `data/` and `campaigns/` are gitignored and never committed to source control).*

---

## Documentation

- **[DATA_CONTRACT.md](DATA_CONTRACT.md)**: Strict definition of the System Layer vs User Layer boundaries.
- **[Architecture Blueprint](docs/ARCHITECTURE.md)**: Deep dive into CDP socket lifecycle, locking mechanisms, and tab management.

---

## License

MIT © 2026 [Karada.ai](https://karada.ai). See [LICENSE](LICENSE) for details.
