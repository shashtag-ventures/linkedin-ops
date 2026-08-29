/**
 * actions/connect.mjs — High-Reliability LinkedIn Connection Invitation
 */

import { delay } from '../cdp.mjs';

export function extractVanityName(linkedinUrl) {
  if (!linkedinUrl) return null;
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match ? match[1].replace(/\/$/, '') : null;
}

export async function sendConnectionInvite(cdp, { linkedinUrl, note, send = false }) {
  if (!linkedinUrl) {
    throw new Error('Missing required parameter: linkedinUrl');
  }

  const vanity = extractVanityName(linkedinUrl);
  const directInviteUrl = vanity
    ? `https://www.linkedin.com/preload/custom-invite/?vanityName=${vanity}`
    : linkedinUrl;

  console.log(`[Connect] 🔍 Checking target: ${vanity || linkedinUrl}...`);
  console.log(`[Connect] 🚀 Navigating to custom-invite route: ${directInviteUrl}`);
  
  await cdp.navigate(directInviteUrl, 3500);
  await cdp.cleanOverlays();

  // Check state
  const modalCheck = await cdp.evaluate(`() => {
    const text = document.body.innerText || '';
    if (text.includes('enter their email') || document.querySelector('input[type="email"], input#email')) return 'EMAIL_REQUIRED';
    if (text.includes('Pending') || text.includes('Withdraw') || text.includes('Invitation sent')) return 'ALREADY_PENDING';
    if (text.includes('1st') || text.includes('Remove connection')) return 'ALREADY_CONNECTED';
    if (text.includes('Something went wrong') || window.location.href.includes('/404')) return 'CUSTOM_INVITE_FAILED';
    const hasAddNote = Array.from(document.querySelectorAll('button')).some(b => {
      const t = (b.innerText || '').toLowerCase();
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      return t === 'add a note' || a.includes('add a note');
    });
    if (hasAddNote) return 'HAS_ADD_NOTE';
    const hasTa = !!document.querySelector('textarea#custom-message, textarea[name="message"], textarea');
    if (hasTa) return 'HAS_TEXTAREA';
    return 'READY';
  }`);

  if (modalCheck === 'EMAIL_REQUIRED') {
    console.warn(`[Connect] ⚠️ Target requires email verification challenge to send invite.`);
    await cdp.evaluate(`() => {
      const cancel = document.querySelector('button[aria-label="Dismiss"], button[aria-label*="Cancel"], .artdeco-modal__dismiss');
      if (cancel) cancel.click();
    }`);
    return { success: false, status: 'EMAIL_REQUIRED', error: 'Target requires email challenge' };
  }

  if (modalCheck === 'ALREADY_PENDING') {
    console.log(`[Connect] ℹ️ Connection request is ALREADY PENDING.`);
    return { success: true, status: 'ALREADY_PENDING' };
  }

  if (modalCheck === 'ALREADY_CONNECTED') {
    console.log(`[Connect] ℹ️ Already connected (1st degree).`);
    return { success: true, status: 'ALREADY_CONNECTED' };
  }

  // Fallback to profile topcard if direct custom-invite failed
  if (modalCheck === 'CUSTOM_INVITE_FAILED') {
    console.log(`[Connect] 🔄 Falling back to standard profile topcard route: ${linkedinUrl}...`);
    await cdp.navigate(linkedinUrl, 4500);
    await cdp.cleanOverlays();

    const topPending = await cdp.evaluate(`() => {
      const top = document.querySelector('main section, div.ph5') || document.body;
      const text = top.innerText || '';
      return text.includes('Pending') || text.includes('Withdraw') || text.includes('1st');
    }`);

    if (topPending) {
      console.log(`[Connect] ℹ️ Profile topcard shows already connected or pending.`);
      return { success: true, status: 'ALREADY_PENDING' };
    }

    console.log(`[Connect] Clicking Connect button on profile topcard...`);
    const clickConnectRes = await cdp.evaluate(`() => {
      const topSection = document.querySelector('main section, div.ph5') || document.body;
      const btns = Array.from(topSection.querySelectorAll('button'));
      const directConnect = btns.find(b => {
        const t = (b.innerText || '').trim().toLowerCase();
        const a = (b.getAttribute('aria-label') || '').toLowerCase();
        return (t === 'connect' || a.includes('invite') && a.includes('connect')) && !b.disabled;
      });
      if (directConnect) {
        directConnect.click();
        return 'DIRECT_CLICKED';
      }
      
      const moreBtn = btns.find(b => {
        const t = (b.innerText || '').trim().toLowerCase();
        const a = (b.getAttribute('aria-label') || '').toLowerCase();
        return t === 'more' || a.includes('more actions');
      });
      if (moreBtn) {
        moreBtn.click();
        return 'MORE_CLICKED';
      }
      return 'NOT_FOUND';
    }`);

    if (clickConnectRes === 'MORE_CLICKED') {
      await delay(1000);
      await cdp.evaluate(`() => {
        const items = Array.from(document.querySelectorAll('.artdeco-dropdown__content div, div.artdeco-dropdown__item, span'));
        const connectItem = items.find(el => {
          const t = (el.innerText || '').trim().toLowerCase();
          const a = (el.getAttribute('aria-label') || '').toLowerCase();
          return t === 'connect' || a.includes('invite') || (t.includes('connect') && !t.includes('connection'));
        });
        if (connectItem) connectItem.click();
      }`);
    }
    await delay(1500);
  }

  // Handle "Add a note" button
  console.log(`[Connect] Searching for "Add a note" button...`);
  for (let i = 0; i < 8; i++) {
    const addNoteClicked = await cdp.evaluate(`() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const addBtn = btns.find(b => {
        const t = (b.innerText || '').trim().toLowerCase();
        const a = (b.getAttribute('aria-label') || '').toLowerCase();
        return t === 'add a note' || a.includes('add a note');
      });
      if (addBtn) {
        addBtn.click();
        return true;
      }
      return false;
    }`);

    if (addNoteClicked) {
      console.log(`[Connect] 📝 Clicked "Add a note" button.`);
      break;
    }
    await delay(500);
  }

  await delay(1200);

  // Type note into textarea
  if (note && note.trim().length > 0) {
    console.log(`[Connect] Typing custom note (${note.length} chars)...`);
    let typed = false;
    for (let i = 0; i < 10; i++) {
      const typeRes = await cdp.evaluate(`() => {
        const ta = document.querySelector('textarea#custom-message, textarea[name="message"], textarea');
        if (!ta) return false;
        ta.focus();
        ta.select();
        let inserted = false;
        try {
          inserted = document.execCommand('insertText', false, ${JSON.stringify(note)});
        } catch (e) {}
        if (!inserted || ta.value.length === 0) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (setter) setter.call(ta, ${JSON.stringify(note)});
          else ta.value = ${JSON.stringify(note)};
        }
        ta.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        ta.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        ta.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        return ta.value.length > 0;
      }`);

      if (typeRes) {
        typed = true;
        console.log(`[Connect] ⌨️ Inserted note.`);
        break;
      }
      await delay(500);
    }

    if (!typed) {
      console.warn(`[Connect] ⚠️ Textarea not found or note could not be injected.`);
    }
  }

  await delay(1200);

  if (!send) {
    console.log(`[Connect] 🔍 [DRY-RUN] Skipped clicking Send button.`);
    return { success: true, status: 'DRY_RUN' };
  }

  // Click Send button
  console.log(`[Connect] Submitting connection invitation...`);
  let sent = false;
  for (let i = 0; i < 10; i++) {
    sent = await cdp.evaluate(`() => {
      const btns = Array.from(document.querySelectorAll('.artdeco-modal button, [role="dialog"] button, button'));
      const sendBtn = btns.find(b => {
        const t = (b.innerText || '').trim().toLowerCase();
        const a = (b.getAttribute('aria-label') || '').toLowerCase();
        return (t === 'send' || a.includes('send invitation') || a.includes('send now') || a === 'send') && !b.disabled && !b.classList.contains('artdeco-button--disabled');
      });
      if (sendBtn) {
        sendBtn.click();
        return true;
      }
      return false;
    }`);

    if (sent) break;
    await delay(800);
  }

  if (sent) {
    await delay(3000);
    console.log(`[Connect] ✅ SUCCESS: Connection invitation delivered!`);
    return { success: true, status: 'SENT' };
  } else {
    console.error(`[Connect] ❌ Send failed: Send button disabled or not found`);
    return { success: false, status: 'SEND_FAILED', error: 'Send button disabled or not found' };
  }
}
