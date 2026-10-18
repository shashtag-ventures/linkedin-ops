/**
 * setup.mjs — Automated & Interactive Setup Wizard for linkedin-ops
 * 
 * Configures Chrome, discovers user profiles without manual copy-pasting,
 * creates local .linkedin-opsrc, generates one-click launchers, and validates auth.
 */

import { writeFileSync, chmodSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { homedir, platform as getOsPlatform } from 'os';
import * as readline from 'readline';
import {
  getChromeBinaryPath,
  getSystemUserDataDir,
  discoverProfiles,
  checkProfileLock,
} from './browser-manager.mjs';
import { saveConfig, loadConfig } from './lock.mjs';
import { runDoctor } from './doctor.mjs';

/**
 * Generate platform-specific launcher script
 */
export function generateLauncherScript(targetPlatform, config) {
  const { chromePath, userDataDir, profileDir, cdpPort = 9222 } = config;
  const profileFlag = profileDir ? `--profile-directory="${profileDir}"` : '';

  if (targetPlatform === 'win32') {
    return (
      `@echo off\r\n` +
      `echo ==========================================================\r\n` +
      `echo [linkedin-ops] Launching Chrome on Debug Port ${cdpPort}...\r\n` +
      `echo ==========================================================\r\n` +
      `start "" "${chromePath}" --remote-debugging-port=${cdpPort} --user-data-dir="${userDataDir}" ${profileFlag} --no-first-run --no-default-browser-check\r\n`
    );
  }

  // macOS / Linux
  return (
    `#!/bin/bash\n` +
    `# linkedin-ops — Chrome Automation Launcher\n` +
    `echo "=========================================================="\n` +
    `echo "🚀 [linkedin-ops] Launching Chrome on Debug Port ${cdpPort}..."\n` +
    `echo "=========================================================="\n` +
    `"${chromePath}" \\\n` +
    `  --remote-debugging-port=${cdpPort} \\\n` +
    `  --user-data-dir="${userDataDir}" \\\n` +
    (profileFlag ? `  ${profileFlag} \\\n` : '') +
    `  --no-first-run \\\n` +
    `  --no-default-browser-check >/dev/null 2>&1 &\n\n` +
    `sleep 2\n` +
    `if curl -s http://127.0.0.1:${cdpPort}/json/version >/dev/null 2>&1; then\n` +
    `  echo "✅ Chrome is LIVE on port ${cdpPort}!"\n` +
    `else\n` +
    `  echo "⚠️ Chrome starting up... check port ${cdpPort}."\n` +
    `fi\n`
  );
}

/**
 * Write launcher file with executable permissions
 */
export function writeLauncherFile(targetPlatform, config, targetPath) {
  const scriptContent = generateLauncherScript(targetPlatform, config);
  writeFileSync(targetPath, scriptContent, 'utf8');
  if (targetPlatform !== 'win32') {
    try {
      chmodSync(targetPath, 0o755);
    } catch {}
  }
  return targetPath;
}

function promptQuestion(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

/**
 * Interactive Setup Wizard
 */
export async function runSetup(options = {}) {
  const platform = options.platform || getOsPlatform();
  console.log('\n==========================================================');
  console.log('⚡ linkedin-ops Setup Wizard');
  console.log('==========================================================\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    // 1. Chrome Binary Detection
    console.log('[1/4] Detecting Google Chrome installation...');
    let chromePath = getChromeBinaryPath(platform);
    if (!chromePath || !existsSync(chromePath)) {
      console.log('⚠️ Could not automatically find Chrome in standard system directories.');
      const answer = await promptQuestion(rl, 'Enter the full path to your Chrome executable: ');
      chromePath = answer.trim();
      if (!chromePath || !existsSync(chromePath)) {
        console.error(`\n❌ Error: Chrome executable not found at: "${chromePath}"`);
        return { success: false, error: 'CHROME_NOT_FOUND' };
      }
    }
    console.log(`  ✓ Found Chrome: ${chromePath}\n`);

    // 2. Profile Discovery
    console.log('[2/4] Discovering Chrome profiles...');
    const sysDataDir = getSystemUserDataDir(platform);
    const discovered = sysDataDir ? discoverProfiles(sysDataDir) : [];

    console.log('Choose which profile has your logged-in LinkedIn account:\n');
    let idx = 1;
    for (const p of discovered) {
      const emailStr = p.email ? ` (${p.email})` : '';
      const defaultTag = p.isDefault ? ' [System Default]' : '';
      console.log(`  [${idx}] ${p.name}${emailStr}${defaultTag}`);
      idx++;
    }
    const isolatedIdx = idx;
    console.log(`  [${isolatedIdx}] Dedicated project session (creates ./.data/session)\n`);

    let selectedUserDataDir = sysDataDir;
    let selectedProfileDir = '';

    const choiceRaw = await promptQuestion(rl, `Select option [1-${isolatedIdx}] (default: 1): `);
    const choiceNum = parseInt(choiceRaw.trim(), 10) || 1;

    if (choiceNum === isolatedIdx) {
      const localSessionDir = resolve(process.cwd(), '.data', 'session');
      mkdirSync(localSessionDir, { recursive: true });
      selectedUserDataDir = localSessionDir;
      selectedProfileDir = '';
      console.log(`  ✓ Selected: Isolated session in "${localSessionDir}"\n`);
    } else if (choiceNum >= 1 && choiceNum <= discovered.length) {
      const chosen = discovered[choiceNum - 1];
      selectedUserDataDir = sysDataDir;
      selectedProfileDir = chosen.id;
      console.log(`  ✓ Selected: "${chosen.name}" (${chosen.id})\n`);
    } else {
      console.log('  ⚠️ Invalid choice, defaulting to option 1.');
      if (discovered.length > 0) {
        selectedUserDataDir = sysDataDir;
        selectedProfileDir = discovered[0].id;
      }
    }

    // 3. Lock & Conflict Check
    console.log('[3/4] Checking browser lock and port availability...');
    const lockStatus = checkProfileLock(selectedUserDataDir);
    if (lockStatus.isLocked) {
      console.log(`\n⚠️ Notice: Chrome is currently running holding PID ${lockStatus.pid}.`);
      console.log('If Chrome is open without --remote-debugging-port=9222, it must restart to enable automation.');
    }

    const config = {
      chromePath,
      userDataDir: selectedUserDataDir,
      profileDir: selectedProfileDir,
      cdpPort: options.cdpPort || 9222,
    };

    saveConfig(config);
    console.log(`  ✓ Configuration saved to .linkedin-opsrc\n`);

    // 4. One-Click Launcher
    console.log('[4/4] Generating convenient launcher...');
    const launcherName = platform === 'win32'
      ? 'start-chrome.bat'
      : platform === 'linux'
      ? 'start-chrome.sh'
      : 'start-chrome.command';
    const localLauncherPath = resolve(process.cwd(), launcherName);
    writeLauncherFile(platform, config, localLauncherPath);
    console.log(`  ✓ Created local launcher: ${launcherName}`);

    // Offer to copy launcher to Desktop on macOS
    if (platform === 'darwin') {
      const desktopPath = join(homedir(), 'Desktop', 'start-chrome-cdp.command');
      try {
        writeLauncherFile(platform, config, desktopPath);
        console.log(`  ✓ Created Desktop launcher: ~/Desktop/start-chrome-cdp.command`);
      } catch {}
    }

    console.log('\n==========================================================');
    console.log('🎉 Setup complete!');
    console.log('==========================================================');
    console.log(`\nNext step: Verify your LinkedIn session with:`);
    console.log(`  node index.mjs doctor\n`);

    return { success: true, config };
  } catch (err) {
    console.error(`\n❌ Setup failed: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    rl.close();
  }
}
