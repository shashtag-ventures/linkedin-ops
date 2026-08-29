/**
 * tab-manager.mjs — Ephemeral Dedicated Tab Lifecycle Manager
 * 
 * Guarantees that every LinkedIn operation runs inside its OWN isolated Chrome tab.
 * Never shares active tabs with other agents.
 * Automatically destroys the tab on completion or error to prevent zombie accumulation.
 */

import { createCDPClient, delay } from './cdp.mjs';

export async function checkCDPConnection(port = 9222) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function createIsolatedTab(initialUrl = 'https://www.linkedin.com/feed/', port = 9222) {
  const url = initialUrl.startsWith('http') ? initialUrl : `https://${initialUrl}`;
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  });

  if (!res.ok) {
    throw new Error(`Failed to create isolated tab on CDP port ${port}: HTTP ${res.status}`);
  }

  const target = await res.json();
  if (!target || !target.id || !target.webSocketDebuggerUrl) {
    throw new Error(`Created tab missing webSocketDebuggerUrl: ${JSON.stringify(target)}`);
  }

  return target;
}

export async function closeTab(targetId, port = 9222) {
  if (!targetId) return false;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Executes a callback with a guaranteed dedicated, isolated Chrome tab.
 * Automatically handles tab creation, CDP binding, and tab closure on exit.
 */
export async function withDedicatedTab(options, fn) {
  const port = typeof options === 'number' ? options : (options?.port || 9222);
  const initialUrl = (typeof options === 'object' && options?.url) || 'https://www.linkedin.com/feed/';
  const autoClose = typeof options === 'object' && options?.autoClose !== undefined ? options.autoClose : true;

  const isAlive = await checkCDPConnection(port);
  if (!isAlive) {
    throw new Error(`Chrome remote debugging is not reachable on http://127.0.0.1:${port}. Please launch Chrome with --remote-debugging-port=${port}`);
  }

  console.log(`[Tab Manager] 📑 Opening dedicated isolated tab for task...`);
  const target = await createIsolatedTab(initialUrl, port);
  console.log(`[Tab Manager] 🎯 Tab allocated: TargetID ${target.id} (${target.url})`);

  const cdp = createCDPClient(target.webSocketDebuggerUrl);

  try {
    await cdp.open();
    // Bring tab into focus
    await cdp.send('Page.bringToFront').catch(() => {});
    await delay(1000);

    const result = await fn(cdp, target);
    return result;
  } finally {
    cdp.close();
    if (autoClose) {
      console.log(`[Tab Manager] 🧹 Cleaning up & closing isolated tab ${target.id}...`);
      await closeTab(target.id, port);
    } else {
      console.log(`[Tab Manager] ℹ️ Tab left open as requested (TargetID: ${target.id})`);
    }
  }
}
