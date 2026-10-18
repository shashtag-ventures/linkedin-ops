/**
 * actions/dm.mjs — LinkedIn 1-to-1 Direct Message Action
 */

import { delay } from '../cdp.mjs';

export async function sendDirectMessage(cdp, { linkedinUrl, message, send = false }) {
  if (!linkedinUrl || !message) {
    throw new Error('Missing required parameters: linkedinUrl and message');
  }

  console.log(`[DM] 🚀 Navigating to profile: ${linkedinUrl}`);
  await cdp.navigate(linkedinUrl, 4000);
  await cdp.cleanOverlays();

  const authCheck = await cdp.evaluate(`() => {
    const url = window.location.href.toLowerCase();
    if (url.includes('/login') || url.includes('/checkpoint') || url.includes('/authwall') || url.includes('/signup')) {
      return false;
    }
    return true;
  }`);

  if (!authCheck) {
    console.warn(`[DM] ❌ Not authenticated: Session redirected to login or authwall.`);
    return {
      success: false,
      status: 'NOT_AUTHENTICATED',
      error: 'Chrome is not logged into LinkedIn. Please log in on the opened browser window or run `node index.mjs setup`.',
    };
  }

  // Find Message button on profile
  console.log(`[DM] Locating Message button...`);
  const msgTarget = await cdp.evaluate(`() => {
    const btns = Array.from(document.querySelectorAll('main section button, div.ph5 button, main section a, div.ph5 a, button, a'));
    const msgBtn = btns.find(b => {
      const t = (b.innerText || '').trim().toLowerCase();
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      return (t === 'message' || a.includes('message')) && !b.disabled;
    });
    if (msgBtn) {
      if (msgBtn.tagName === 'A' && msgBtn.href) {
        return { type: 'link', href: msgBtn.href };
      }
      msgBtn.click();
      return { type: 'button' };
    }
    return null;
  }`);

  if (!msgTarget) {
    console.warn(`[DM] ⚠️ Direct Message button not found (user might not be 1st connection or messaging locked).`);
    return { success: false, status: 'NO_MESSAGE_BUTTON', error: 'Message button not available' };
  }

  if (msgTarget.type === 'link') {
    await cdp.navigate(msgTarget.href, 3500);
  } else {
    await delay(2000);
  }

  // Type message into chat composer (with retry loop)
  console.log(`[DM] Typing message (${message.length} chars)...`);
  let typed = false;
  for (let i = 0; i < 10; i++) {
    typed = await cdp.evaluate(`(text) => {
      const composer = document.querySelector('.msg-form__contenteditable, [role="textbox"][contenteditable="true"], div.msg-form__msg-content-container--is-active [contenteditable="true"]');
      if (!composer) return false;
      composer.focus();
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, text);
      } catch (e) {}
      if (!inserted || !composer.innerText) {
        composer.innerHTML = '<p>' + text.replace(/\\n/g, '<br>') + '</p>';
      }
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }`, message);

    if (typed) break;
    await delay(1000);
  }

  if (!typed) {
    console.error(`[DM] ❌ Could not locate message composer.`);
    return { success: false, status: 'COMPOSER_NOT_FOUND' };
  }

  await delay(1500);

  if (!send) {
    console.log(`[DM] 🔍 [DRY-RUN] Message typed. Skipping Send.`);
    return { success: true, status: 'DRY_RUN' };
  }

  // Click Send
  console.log(`[DM] Sending direct message...`);
  let sent = false;
  for (let i = 0; i < 8; i++) {
    sent = await cdp.evaluate(`() => {
      const sendBtn = document.querySelector('.msg-form__send-button, button[type="submit"].msg-form__send-btn, button[aria-label="Send now"], button[type="submit"]');
      if (sendBtn && !sendBtn.disabled && !sendBtn.classList.contains('artdeco-button--disabled')) {
        sendBtn.click();
        return true;
      }
      return false;
    }`);
    if (sent) break;
    await delay(800);
  }

  if (sent) {
    await delay(2500);
    console.log(`[DM] ✅ SUCCESS: LinkedIn DM delivered!`);
    return { success: true, status: 'SENT' };
  } else {
    console.error(`[DM] ❌ Send button disabled or not found.`);
    return { success: false, status: 'SEND_FAILED' };
  }
}
