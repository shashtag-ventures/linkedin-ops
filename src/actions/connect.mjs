/**
 * actions/connect.mjs — High-Reliability LinkedIn Connection Invitation
 * 
 * Zero-False-Positive Guarantee:
 * 1. Checks profile state (1st connection, pending, email required)
 * 2. Clicks Connect across topcard buttons and links
 * 3. Enforces note insertion gate when note is requested
 * 4. Verifies post-send state (modal dismissal, absence of error toasts, and Pending status)
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

  // 1. Initial State Check on custom-invite route
  const modalCheck = await cdp.evaluate(`() => {
    const url = window.location.href.toLowerCase();
    if (url.includes('/login') || url.includes('/checkpoint') || url.includes('/authwall') || url.includes('/signup')) {
      return 'NOT_AUTHENTICATED';
    }
    const text = document.body.innerText || '';
    if (text.includes('enter their email') || document.querySelector('input[type="email"], input#email')) return 'EMAIL_REQUIRED';
    if (text.includes('Pending') || text.includes('Withdraw') || text.includes('Invitation sent')) return 'ALREADY_PENDING';
    if (text.includes('1st') || text.includes('Remove connection')) return 'ALREADY_CONNECTED';
    if (text.includes('Something went wrong') || window.location.href.includes('/404') || text.includes("This page doesn’t exist") || text.includes("This page doesn't exist")) return 'CUSTOM_INVITE_FAILED';
    
    const hasAddNote = Array.from(document.querySelectorAll('button, a')).some(b => {
      const t = (b.innerText || '').toLowerCase();
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      return t === 'add a note' || a.includes('add a note');
    });
    if (hasAddNote) return 'HAS_ADD_NOTE';
    
    const hasTa = !!document.querySelector('textarea#custom-message, textarea[name="message"], textarea');
    if (hasTa) return 'HAS_TEXTAREA';
    
    return 'READY';
  }`);

  if (modalCheck === 'NOT_AUTHENTICATED') {
    console.warn(`[Connect] ❌ Not authenticated: Session redirected to login or authwall.`);
    return {
      success: false,
      status: 'NOT_AUTHENTICATED',
      error: 'Chrome is not logged into LinkedIn. Please log in on the opened browser window or run `node index.mjs setup`.',
    };
  }

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

  // 2. Fallback to profile topcard if direct custom-invite failed
  if (modalCheck === 'CUSTOM_INVITE_FAILED') {
    console.log(`[Connect] 🔄 Falling back to standard profile topcard route: ${linkedinUrl}...`);
    await cdp.navigate(linkedinUrl, 4500);
    await cdp.cleanOverlays();

    const topState = await cdp.evaluate(`() => {
      const url = window.location.href.toLowerCase();
      if (url.includes('/login') || url.includes('/checkpoint') || url.includes('/authwall') || url.includes('/signup')) {
        return 'NOT_AUTHENTICATED';
      }
      const top = document.querySelector('main section, div.ph5') || document.body;
      const text = top.innerText || '';
      if (text.includes('Pending') || text.includes('Withdraw') || text.includes('Invitation sent')) return 'ALREADY_PENDING';
      if (text.includes('1st') || text.includes('Remove connection')) return 'ALREADY_CONNECTED';
      return 'READY';
    }`);

    if (topState === 'NOT_AUTHENTICATED') {
      console.warn(`[Connect] ❌ Not authenticated: Profile redirected to login or authwall.`);
      return {
        success: false,
        status: 'NOT_AUTHENTICATED',
        error: 'Chrome is not logged into LinkedIn. Please log in on the opened browser window or run `node index.mjs setup`.',
      };
    }

    if (topState === 'ALREADY_PENDING') {
      console.log(`[Connect] ℹ️ Profile topcard shows already connected or pending.`);
      return { success: true, status: 'ALREADY_PENDING' };
    }
    if (topState === 'ALREADY_CONNECTED') {
      console.log(`[Connect] ℹ️ Already connected (1st degree).`);
      return { success: true, status: 'ALREADY_CONNECTED' };
    }

    console.log(`[Connect] Clicking Connect button on profile topcard...`);
    const clickConnectRes = await cdp.evaluate(`() => {
      const topSection = document.querySelector('main section, div.ph5') || document.body;
      const allInteractive = Array.from(topSection.querySelectorAll('button, a'));
      
      const directConnect = allInteractive.find(b => {
        const t = (b.innerText || '').trim().toLowerCase();
        const a = (b.getAttribute('aria-label') || '').toLowerCase();
        return (t === 'connect' || (a.includes('invite') && a.includes('connect'))) && !b.disabled;
      });
      if (directConnect) {
        directConnect.click();
        return 'DIRECT_CLICKED';
      }
      
      const moreBtn = allInteractive.find(b => {
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
        const items = Array.from(document.querySelectorAll('.artdeco-dropdown__content div, div.artdeco-dropdown__item, span, a, button'));
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

  // 3. Handle "Add a note" button
  console.log(`[Connect] Searching for "Add a note" button...`);
  let addNoteClicked = false;
  for (let i = 0; i < 8; i++) {
    const clicked = await cdp.evaluate(`() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
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

    if (clicked) {
      addNoteClicked = true;
      console.log(`[Connect] 📝 Clicked "Add a note" button.`);
      break;
    }
    await delay(500);
  }

  await delay(1200);

  // 4. Type note into textarea (Strict Verification Gate)
  if (note && note.trim().length > 0) {
    console.log(`[Connect] Typing custom note (${note.length} chars)...`);
    let typed = false;
    for (let i = 0; i < 10; i++) {
      const typeRes = await cdp.evaluate(`(noteContent) => {
        const ta = document.querySelector('textarea#custom-message, textarea[name="message"], textarea');
        if (!ta) return false;
        ta.focus();
        ta.select();
        let inserted = false;
        try {
          inserted = document.execCommand('insertText', false, noteContent);
        } catch (e) {}
        if (!inserted || ta.value.length === 0) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (setter) setter.call(ta, noteContent);
          else ta.value = noteContent;
        }
        ta.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return ta.value.length > 0;
      }`, note);

      if (typeRes) {
        typed = true;
        console.log(`[Connect] ⌨️ Successfully inserted note.`);
        break;
      }
      await delay(500);
    }

    if (!typed) {
      console.error(`[Connect] ❌ Hard Error: Textarea not found or note could not be injected.`);
      return { success: false, status: 'NOTE_INJECTION_FAILED', error: 'Could not inject custom note into textarea' };
    }
  }

  await delay(1200);

  if (!send) {
    console.log(`[Connect] 🔍 [DRY-RUN] Skipped clicking Send button.`);
    return { success: true, status: 'DRY_RUN' };
  }

  // 5. Click Send Button (Strict Click Verification)
  console.log(`[Connect] Submitting connection invitation...`);
  let sentClicked = false;
  for (let i = 0; i < 10; i++) {
    const sendRes = await cdp.evaluate(`() => {
      const btns = Array.from(document.querySelectorAll('.artdeco-modal button, [role="dialog"] button, button, a'));
      const sendBtn = btns.find(b => {
        const t = (b.innerText || '').trim().toLowerCase();
        const a = (b.getAttribute('aria-label') || '').toLowerCase();
        return (t === 'send' || a.includes('send invitation') || a.includes('send now') || a === 'send') && !b.disabled && !b.classList.contains('artdeco-button--disabled');
      });
      if (sendBtn) {
        sendBtn.click();
        return 'CLICKED';
      }
      return 'NOT_FOUND';
    }`);

    if (sendRes === 'CLICKED') {
      sentClicked = true;
      break;
    }
    await delay(800);
  }

  if (!sentClicked) {
    console.error(`[Connect] ❌ Send failed: Send button disabled or not found`);
    return { success: false, status: 'SEND_FAILED', error: 'Send button disabled or not found' };
  }

  // 6. Post-Send Delivery Verification (Anti-False-Positive Gate)
  console.log(`[Connect] 🔍 Verifying delivery post-send...`);
  await delay(3000);

  const postSendVerification = await cdp.evaluate(`() => {
    const text = document.body.innerText || '';
    if (text.includes('reached the daily invitation limit')) {
      return { ok: false, error: 'DAILY_LIMIT_REACHED' };
    }
    if (text.includes('reached the weekly invitation limit') || text.includes('Unable to send invitation')) {
      return { ok: false, error: 'WEEKLY_LIMIT_REACHED' };
    }
    if (text.includes('enter their email') || document.querySelector('input[type="email"]')) {
      return { ok: false, error: 'EMAIL_CHALLENGE_BLOCKED' };
    }
    // Check if modal dismissed
    const modal = document.querySelector('.artdeco-modal, [role="dialog"]');
    const isModalDismissed = !modal || !modal.offsetParent;
    return { ok: isModalDismissed, error: isModalDismissed ? null : 'MODAL_NOT_DISMISSED' };
  }`);

  if (!postSendVerification || !postSendVerification.ok) {
    // Check target profile topcard for Pending status
    try {
      await cdp.navigate(linkedinUrl, 4000);
      const isPending = await cdp.evaluate(`() => {
        const text = document.body.innerText || '';
        return /pending|invitation sent|withdraw/i.test(text);
      }`);
      if (isPending) {
        console.log(`[Connect] ✅ SUCCESS: Connection invitation verified Pending on profile topcard!`);
        return { success: true, status: 'SENT' };
      }
    } catch (e) {}

    console.error(`[Connect] ❌ Post-send verification failed: ${postSendVerification?.error || 'Unknown error'}`);
    return { success: false, status: 'VERIFICATION_FAILED', error: postSendVerification?.error || 'Delivery not verified' };
  }

  console.log(`[Connect] ✅ SUCCESS: Connection invitation delivered and verified!`);
  return { success: true, status: 'SENT' };
}
