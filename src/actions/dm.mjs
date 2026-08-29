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

  // Find Message button on profile
  console.log(`[DM] Locating Message button...`);
  const clickedMsg = await cdp.evaluate(`() => {
    const btns = Array.from(document.querySelectorAll('main section button, div.ph5 button, button'));
    const msgBtn = btns.find(b => {
      const t = (b.innerText || '').trim().toLowerCase();
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      return (t === 'message' || a.includes('message')) && !b.disabled;
    });
    if (msgBtn) {
      msgBtn.click();
      return true;
    }
    return false;
  }`);

  if (!clickedMsg) {
    console.warn(`[DM] ⚠️ Direct Message button not found (user might not be 1st connection or messaging locked).`);
    return { success: false, status: 'NO_MESSAGE_BUTTON', error: 'Message button not available' };
  }

  await delay(2000);

  // Type message into chat composer
  console.log(`[DM] Typing message (${message.length} chars)...`);
  const typed = await cdp.evaluate(`(text) => {
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
  const sent = await cdp.evaluate(`() => {
    const sendBtn = document.querySelector('.msg-form__send-button, button[type="submit"].msg-form__send-btn');
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
      return true;
    }
    return false;
  }`);

  if (sent) {
    await delay(2500);
    console.log(`[DM] ✅ SUCCESS: LinkedIn DM delivered!`);
    return { success: true, status: 'SENT' };
  } else {
    console.error(`[DM] ❌ Send button disabled or not found.`);
    return { success: false, status: 'SEND_FAILED' };
  }
}
