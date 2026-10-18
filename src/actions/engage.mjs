/**
 * actions/engage.mjs — LinkedIn Comment & Post Engagement Action
 */

import { delay } from '../cdp.mjs';

export async function submitComment(cdp, { postUrl, comment, send = false }) {
  if (!postUrl || !comment) {
    throw new Error('Missing required parameters: postUrl and comment');
  }

  console.log(`[Engage] 🚀 Navigating to post: ${postUrl}`);
  await cdp.navigate(postUrl, 4000);
  await cdp.cleanOverlays();

  const authCheck = await cdp.evaluate(`() => {
    const url = window.location.href.toLowerCase();
    if (url.includes('/login') || url.includes('/checkpoint') || url.includes('/authwall') || url.includes('/signup')) {
      return false;
    }
    return true;
  }`);

  if (!authCheck) {
    console.warn(`[Engage] ❌ Not authenticated: Session redirected to login or authwall.`);
    return {
      success: false,
      status: 'NOT_AUTHENTICATED',
      error: 'Chrome is not logged into LinkedIn. Please log in on the opened browser window or run `node index.mjs setup`.',
    };
  }

  console.log(`[Engage] Finding comment input...`);
  // Click Comment button or box
  await cdp.evaluate(`() => {
    const commentBtn = document.querySelector('button[aria-label*="Comment"], .comment-button, button.comments-comment-box__submit-button--cr');
    if (commentBtn) commentBtn.click();
  }`);
  await delay(1500);

  console.log(`[Engage] Typing comment (${comment.length} chars)...`);
  const typed = await cdp.evaluate(`(text) => {
    const box = document.querySelector('.ql-editor[contenteditable="true"], .comments-comment-box__editor [contenteditable="true"], div[role="textbox"]');
    if (!box) return false;
    box.focus();
    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch (e) {}
    if (!inserted || !box.innerText) {
      box.innerHTML = '<p>' + text.replace(/\\n/g, '<br>') + '</p>';
    }
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }`, comment);

  if (!typed) {
    console.error(`[Engage] ❌ Could not find comment editor.`);
    return { success: false, status: 'COMMENT_BOX_NOT_FOUND' };
  }

  await delay(1500);

  if (!send) {
    console.log(`[Engage] 🔍 [DRY-RUN] Comment drafted. Skipping Submit.`);
    return { success: true, status: 'DRY_RUN' };
  }

  console.log(`[Engage] Submitting comment...`);
  const submitted = await cdp.evaluate(`() => {
    const submitBtn = document.querySelector('button.comments-comment-box__submit-button, button.comments-comment-box__submit-button--cr');
    if (submitBtn && !submitBtn.disabled) {
      submitBtn.click();
      return true;
    }
    return false;
  }`);

  if (submitted) {
    await delay(3000);
    console.log(`[Engage] ✅ SUCCESS: Comment posted!`);
    return { success: true, status: 'SUBMITTED' };
  } else {
    console.error(`[Engage] ❌ Comment submit button disabled or not found.`);
    return { success: false, status: 'SUBMIT_FAILED' };
  }
}
