# linkedin-ops

High-reliability, multi-agent-safe LinkedIn automation engine and CLI.

## Architecture Guarantees
1. **Cross-Process Mutex Locking**: Serializes execution across concurrent agents and processes (`~/.config/linkedin-ops/linkedin.lock`). Prevents session collisions, focus-stealing, and rate-limiting.
2. **Isolated Ephemeral Tabs**: Each operation spawns its own dedicated Chrome tab via `PUT /json/new` and connects directly via target ID.
3. **Auto-Cleanup**: Guarantees tab destruction (`/json/close/<targetId>`) in a `finally` block on success or failure, eliminating zombie tab leaks.

## CLI Usage
```bash
# Connection invitation with personalized note (dry-run)
node index.mjs connect --profile="https://www.linkedin.com/in/username" --note="Hi, loved your post on Go..."

# Live connection invitation
node index.mjs connect --profile="https://www.linkedin.com/in/username" --note="Hi, loved your post on Go..." --send

# Direct message to 1st-degree connection
node index.mjs dm --profile="https://www.linkedin.com/in/username" --message="Checking in on our conversation." --send

# Comment on a LinkedIn post
node index.mjs comment --url="https://www.linkedin.com/posts/..." --text="Great insights on distributed systems!" --send

# Check or release mutex lock
node index.mjs lock
node index.mjs lock release
```

## Programmatic Library Usage
```javascript
import { withLock, withDedicatedTab, sendConnectionInvite } from 'linkedin-ops';

await withLock('outreach-task', async () => {
  await withDedicatedTab({ port: 9222 }, async (cdp) => {
    const result = await sendConnectionInvite(cdp, {
      linkedinUrl: 'https://www.linkedin.com/in/username',
      note: 'Hello from Karada',
      send: true
    });
    console.log(result);
  });
});
```
