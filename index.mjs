#!/usr/bin/env node

/**
 * linkedin-ops — High-Reliability LinkedIn Automation CLI & Core Engine
 * 
 * Features:
 * - Cross-Process Mutex Locking (guarantees serial execution, no race conditions)
 * - Isolated Ephemeral Tab Lifecycle (opens unique tab via PUT /json/new, auto-closes in finally)
 * - Zero Tab Clobbering / Zombie Tab Prevention
 * 
 * Usage:
 *   node index.mjs connect --profile="https://linkedin.com/in/..." --note="..." [--send]
 *   node index.mjs dm --profile="https://linkedin.com/in/..." --message="..." [--send]
 *   node index.mjs comment --url="https://linkedin.com/posts/..." --text="..." [--send]
 *   node index.mjs lock release
 */

import { withLock, readLock, forceReleaseLock } from './src/lock.mjs';
import { withDedicatedTab } from './src/tab-manager.mjs';
import { sendConnectionInvite } from './src/actions/connect.mjs';
import { sendDirectMessage } from './src/actions/dm.mjs';
import { submitComment } from './src/actions/engage.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith('--') ? args[0] : 'connect';
  const options = {
    command,
    profile: '',
    url: '',
    note: '',
    message: '',
    text: '',
    send: false,
    cdpPort: 9222,
    keepTab: false,
    noLock: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--profile=')) {
      options.profile = arg.split('=')[1].trim();
    } else if (arg.startsWith('--url=')) {
      options.url = arg.split('=')[1].trim();
    } else if (arg.startsWith('--note=')) {
      options.note = arg.substring('--note='.length).trim();
    } else if (arg.startsWith('--message=')) {
      options.message = arg.substring('--message='.length).trim();
    } else if (arg.startsWith('--text=')) {
      options.text = arg.substring('--text='.length).trim();
    } else if (arg === '--send') {
      options.send = true;
    } else if (arg === '--keep-tab') {
      options.keepTab = true;
    } else if (arg === '--no-lock') {
      options.noLock = true;
    } else if (arg.startsWith('--port=')) {
      options.cdpPort = parseInt(arg.split('=')[1].trim(), 10) || 9222;
    } else if (arg === '--help' || arg === '-h') {
      options.command = 'help';
    }
  }

  return options;
}

function printHelp() {
  console.log(`
linkedin-ops — Unified LinkedIn Automation Engine

COMMANDS:
  connect   Send a connection request with a personalized note
  dm        Send a direct 1-to-1 message to a connection
  comment   Post a comment to a LinkedIn publication/post
  lock      Inspect or force-release active mutex lock

OPTIONS:
  --profile="<url>"   Target LinkedIn profile URL
  --url="<url>"       Target LinkedIn post/feed URL
  --note="<text>"     Connection note text (max 300 chars)
  --message="<text>"  Direct message text
  --text="<text>"     Comment text
  --send              Live submit (default: false / dry-run)
  --port=<num>        Chrome CDP port (default: 9222)
  --keep-tab          Do not close the tab when finished
  --no-lock           Bypass mutex lock (not recommended)

EXAMPLES:
  linkedin-ops connect --profile="https://www.linkedin.com/in/satyanadella" --note="Hello Satya" --send
  linkedin-ops dm --profile="https://www.linkedin.com/in/friend" --message="Checking in" --send
  linkedin-ops lock release
`);
}

async function run() {
  const options = parseArgs();

  if (options.command === 'help') {
    printHelp();
    process.exit(0);
  }

  if (options.command === 'lock') {
    const sub = process.argv[3];
    if (sub === 'release' || sub === 'clean') {
      const released = forceReleaseLock();
      console.log(released ? '✅ Lock file released.' : 'ℹ️ No active lock file found.');
      process.exit(0);
    }
    const current = readLock();
    if (current) {
      console.log(`🔒 Active Lock: Held by PID ${current.pid} for "${current.task}" since ${new Date(current.timestamp).toLocaleTimeString()}`);
    } else {
      console.log('🔓 No active lock.');
    }
    process.exit(0);
  }

  const runWithExecution = async () => {
    return withDedicatedTab({
      port: options.cdpPort,
      autoClose: !options.keepTab,
    }, async (cdp, target) => {
      if (options.command === 'connect') {
        const profile = options.profile || options.url;
        if (!profile) throw new Error('--profile="<url>" is required for connect');
        return await sendConnectionInvite(cdp, {
          linkedinUrl: profile,
          note: options.note,
          send: options.send,
        });
      } else if (options.command === 'dm') {
        const profile = options.profile || options.url;
        if (!profile) throw new Error('--profile="<url>" is required for dm');
        return await sendDirectMessage(cdp, {
          linkedinUrl: profile,
          message: options.message || options.text,
          send: options.send,
        });
      } else if (options.command === 'comment') {
        const postUrl = options.url || options.profile;
        if (!postUrl) throw new Error('--url="<postUrl>" is required for comment');
        return await submitComment(cdp, {
          postUrl,
          comment: options.text || options.note,
          send: options.send,
        });
      } else {
        throw new Error(`Unknown command: ${options.command}`);
      }
    });
  };

  try {
    let result;
    if (options.noLock) {
      result = await runWithExecution();
    } else {
      result = await withLock(`linkedin-${options.command}`, runWithExecution);
    }

    if (result.success) {
      console.log(`\n✅ SUCCESS: Operation "${options.command}" completed (status: ${result.status})`);
      process.exit(0);
    } else {
      console.error(`\n❌ FAILED: Operation "${options.command}" failed: ${result.error || result.status}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Fatal Error: ${err.message}`);
    process.exit(1);
  }
}

// Export functions for library usage
export {
  withLock,
  withDedicatedTab,
  sendConnectionInvite,
  sendDirectMessage,
  submitComment,
};

// Auto-run if executed from CLI
if (process.argv[1] && process.argv[1].endsWith('index.mjs')) {
  run();
}
