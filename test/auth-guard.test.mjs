import test from 'node:test';
import assert from 'node:assert';
import { sendConnectionInvite } from '../src/actions/connect.mjs';
import { sendDirectMessage } from '../src/actions/dm.mjs';
import { submitComment } from '../src/actions/engage.mjs';

function createMockCDP(currentUrl) {
  return {
    async navigate(url) {},
    async cleanOverlays() {},
    async evaluate(fnStr) {
      if (typeof fnStr === 'string' && fnStr.includes('window.location.href')) {
        // Return NOT_AUTHENTICATED if url is a login redirect
        const normalized = currentUrl.toLowerCase();
        if (normalized.includes('/login') || normalized.includes('/checkpoint') || normalized.includes('/authwall') || normalized.includes('/signup')) {
          if (fnStr.includes("'NOT_AUTHENTICATED'")) return 'NOT_AUTHENTICATED';
          return false;
        }
      }
      return null;
    }
  };
}

test('sendConnectionInvite detects unauthenticated session and returns NOT_AUTHENTICATED', async () => {
  const mockCDP = createMockCDP('https://www.linkedin.com/login?fromSignIn=true');
  const result = await sendConnectionInvite(mockCDP, {
    linkedinUrl: 'https://www.linkedin.com/in/testuser',
    note: 'Hello test',
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'NOT_AUTHENTICATED');
  assert.ok(result.error.includes('not logged into LinkedIn'));
});

test('sendDirectMessage detects unauthenticated session and returns NOT_AUTHENTICATED', async () => {
  const mockCDP = createMockCDP('https://www.linkedin.com/login?fromSignIn=true');
  const result = await sendDirectMessage(mockCDP, {
    linkedinUrl: 'https://www.linkedin.com/in/testuser',
    message: 'Hello direct message',
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'NOT_AUTHENTICATED');
  assert.ok(result.error.includes('not logged into LinkedIn'));
});

test('submitComment detects unauthenticated session and returns NOT_AUTHENTICATED', async () => {
  const mockCDP = createMockCDP('https://www.linkedin.com/login?fromSignIn=true');
  const result = await submitComment(mockCDP, {
    postUrl: 'https://www.linkedin.com/posts/12345',
    comment: 'Great post',
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'NOT_AUTHENTICATED');
  assert.ok(result.error.includes('not logged into LinkedIn'));
});
