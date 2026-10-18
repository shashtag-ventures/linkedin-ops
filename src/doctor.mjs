/**
 * doctor.mjs — Pre-flight Diagnostics and Health Check for linkedin-ops
 * 
 * Verifies:
 * 1. CDP Reachability on port 9222
 * 2. Chrome Version, Protocol Version, User Agent, WebSocket Debugger URL
 * 3. LinkedIn Login / Authentication State
 * 4. Provides copy-pasteable OS-specific fixes if anything is missing
 */

import { createIsolatedTab, closeTab } from './tab-manager.mjs';
import { createCDPClient, delay } from './cdp.mjs';
import { loadConfig } from './lock.mjs';
import { getSystemUserDataDir } from './browser-manager.mjs';

export function getOSFixCommand(platform = process.platform, port = 9222) {
  const config = loadConfig();
  const userDataDir = config.userDataDir || getSystemUserDataDir(platform) || '$HOME/.config/google-chrome';
  const profileFlag = config.profileDir ? ` --profile-directory="${config.profileDir}"` : '';

  if (platform === 'darwin') {
    return `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=${port} --user-data-dir="${userDataDir}"${profileFlag} &`;
  }
  if (platform === 'linux') {
    return `google-chrome --remote-debugging-port=${port} --user-data-dir="${userDataDir}"${profileFlag} &`;
  }
  if (platform === 'win32') {
    return `chrome.exe --remote-debugging-port=${port} --user-data-dir="${userDataDir}"${profileFlag}`;
  }
  return `google-chrome --remote-debugging-port=${port} --user-data-dir="${userDataDir}"${profileFlag}`;
}

export function evaluateLinkedInUrl(url = '') {
  const normalized = url.toLowerCase();

  if (normalized.includes('/login') || normalized.includes('/checkpoint/lg')) {
    return { loggedIn: false, reason: 'login_redirect' };
  }
  if (normalized.includes('/checkpoint/challenge')) {
    return { loggedIn: false, reason: 'auth_challenge' };
  }
  if (normalized.includes('/authwall')) {
    return { loggedIn: false, reason: 'authwall' };
  }
  if (normalized.includes('/signup')) {
    return { loggedIn: false, reason: 'signup_redirect' };
  }
  if (normalized.includes('/feed')) {
    return { loggedIn: true, reason: 'feed_detected' };
  }
  if (normalized.includes('/in/') || normalized.includes('/messaging') || normalized.includes('/mynetwork')) {
    return { loggedIn: true, reason: 'profile_detected' };
  }

  return { loggedIn: false, reason: 'unrecognized_state' };
}

export async function probeCDPVersion(port = 9222) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    return {
      reachable: true,
      port,
      browser: data.Browser || 'Unknown',
      protocolVersion: data['Protocol-Version'] || 'Unknown',
      userAgent: data['User-Agent'] || 'Unknown',
      webSocketDebuggerUrl: data.webSocketDebuggerUrl || '',
    };
  } catch (err) {
    const fixCommand = getOSFixCommand(process.platform, port);
    const suggestedFix =
      `To launch Chrome with remote debugging on your OS (${process.platform}):\n` +
      `  ${fixCommand}`;

    return {
      reachable: false,
      port,
      error: `Could not connect to Chrome CDP on port ${port} (${err.message})`,
      suggestedFix,
    };
  }
}

export async function checkLinkedInSession(port = 9222) {
  try {
    // 1. First check if any existing tab already is on linkedin.com
    const listRes = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(2000),
    });
    if (listRes.ok) {
      const tabs = await listRes.json();
      const existingLinkedInTab = tabs.find((t) => t.url && t.url.includes('linkedin.com'));
      if (existingLinkedInTab) {
        const evalResult = evaluateLinkedInUrl(existingLinkedInTab.url);
        if (evalResult.loggedIn) {
          return {
            checked: true,
            loggedIn: true,
            url: existingLinkedInTab.url,
            reason: 'active_tab_authenticated',
          };
        }
      }
    }

    // 2. Open an isolated tab to inspect current session
    const target = await createIsolatedTab('https://www.linkedin.com/feed/', port);
    const cdp = createCDPClient(target.webSocketDebuggerUrl);

    let finalUrl = target.url || '';
    try {
      await cdp.open();
      // Allow navigation and redirects to settle
      await delay(2000);
      const evalRes = await cdp.send('Runtime.evaluate', {
        expression: 'window.location.href',
        returnByValue: true,
      });
      if (evalRes?.result?.value) {
        finalUrl = evalRes.result.value;
      }
    } finally {
      cdp.close();
      await closeTab(target.id, port).catch(() => {});
    }

    const evaluation = evaluateLinkedInUrl(finalUrl);
    return {
      checked: true,
      loggedIn: evaluation.loggedIn,
      url: finalUrl,
      reason: evaluation.reason,
    };
  } catch (err) {
    return {
      checked: false,
      loggedIn: false,
      error: err.message,
    };
  }
}

export async function runDoctor(options = {}) {
  const port = options.port || 9222;
  const silent = options.silent || false;
  const checkSession = options.checkSession !== false;

  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  log(`\n🔍 Running linkedin-ops Pre-flight Diagnostics...`);
  log(`   Platform: ${process.platform} (${process.arch})`);
  log(`   Node.js:  ${process.version}`);
  log(`   Target:   http://127.0.0.1:${port}\n`);

  // Step 1: Probe CDP connection
  const cdpInfo = await probeCDPVersion(port);

  if (!cdpInfo.reachable) {
    log(`❌ Step 1/2: Chrome Remote Debugging (Port ${port}): NOT REACHABLE`);
    log(`\n${cdpInfo.error}`);
    log(`\n============================================================`);
    log(`🛠️ HOW TO FIX:`);
    log(cdpInfo.suggestedFix);
    log(`============================================================\n`);

    return {
      success: false,
      cdpReachable: false,
      error: cdpInfo.error,
      recommendation: cdpInfo.suggestedFix,
    };
  }

  log(`✅ Step 1/2: Chrome Remote Debugging (Port ${port}): CONNECTED`);
  log(`   Browser:   ${cdpInfo.browser}`);
  log(`   Protocol:  ${cdpInfo.protocolVersion}`);
  log(`   WebSocket: ${cdpInfo.webSocketDebuggerUrl}`);

  // Step 2: Check LinkedIn Login Session
  if (!checkSession) {
    return {
      success: true,
      cdpReachable: true,
      cdp: cdpInfo,
    };
  }

  log(`\n🔎 Step 2/2: Checking LinkedIn Authentication Session...`);
  const sessionInfo = await checkLinkedInSession(port);

  if (!sessionInfo.checked) {
    log(`⚠️ Step 2/2: Could not probe LinkedIn session (${sessionInfo.error})`);
    log(`   Ensure you have internet connectivity.`);
    return {
      success: true,
      cdpReachable: true,
      cdp: cdpInfo,
      session: sessionInfo,
    };
  }

  if (sessionInfo.loggedIn) {
    log(`✅ Step 2/2: LinkedIn Authentication: LOGGED IN`);
    log(`   Session URL: ${sessionInfo.url}`);
    log(`\n🎉 All systems operational! You are ready to run linkedin-ops.`);
    log(`   Try a dry run:`);
    log(`     node index.mjs connect --profile="https://www.linkedin.com/in/username" --note="Hello!"\n`);

    return {
      success: true,
      cdpReachable: true,
      loggedIn: true,
      cdp: cdpInfo,
      session: sessionInfo,
    };
  }

  log(`⚠️ Step 2/2: LinkedIn Authentication: NOT LOGGED IN`);
  log(`   Current URL: ${sessionInfo.url}`);
  log(`   Status:      ${sessionInfo.reason}`);
  log(`\n============================================================`);
  log(`👉 ACTION REQUIRED:`);
  log(`   Please open your Chrome window and log into LinkedIn:`);
  log(`   https://www.linkedin.com/login`);
  log(`   Once logged in, run 'npm run doctor' again to verify.`);
  log(`============================================================\n`);

  return {
    success: false,
    cdpReachable: true,
    loggedIn: false,
    cdp: cdpInfo,
    session: sessionInfo,
    recommendation: 'Log into LinkedIn in the remote debugging Chrome window.',
  };
}
