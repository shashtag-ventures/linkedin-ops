import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import {
  probeCDPVersion,
  evaluateLinkedInUrl,
  runDoctor,
  getOSFixCommand,
} from '../src/doctor.mjs';

test('evaluateLinkedInUrl accurately classifies authenticated vs login URLs', () => {
  assert.deepStrictEqual(evaluateLinkedInUrl('https://www.linkedin.com/feed/'), {
    loggedIn: true,
    reason: 'feed_detected',
  });
  assert.deepStrictEqual(evaluateLinkedInUrl('https://www.linkedin.com/in/satyanadella'), {
    loggedIn: true,
    reason: 'profile_detected',
  });
  assert.deepStrictEqual(evaluateLinkedInUrl('https://www.linkedin.com/login?fromSignIn=true'), {
    loggedIn: false,
    reason: 'login_redirect',
  });
  assert.deepStrictEqual(evaluateLinkedInUrl('https://www.linkedin.com/checkpoint/challenge/123'), {
    loggedIn: false,
    reason: 'auth_challenge',
  });
  assert.deepStrictEqual(evaluateLinkedInUrl('https://www.linkedin.com/authwall?trk=...'), {
    loggedIn: false,
    reason: 'authwall',
  });
});

test('getOSFixCommand generates appropriate one-liner for platform', () => {
  const darwinCmd = getOSFixCommand('darwin', 9222);
  assert.ok(darwinCmd.includes('Google Chrome'));
  assert.ok(darwinCmd.includes('--remote-debugging-port=9222'));

  const linuxCmd = getOSFixCommand('linux', 9222);
  assert.ok(linuxCmd.includes('google-chrome'));
  assert.ok(linuxCmd.includes('--remote-debugging-port=9222'));

  const winCmd = getOSFixCommand('win32', 9222);
  assert.ok(winCmd.includes('chrome.exe'));
  assert.ok(winCmd.includes('--remote-debugging-port=9222'));
});

test('probeCDPVersion detects unreachable port and provides OS-specific fix', async () => {
  const result = await probeCDPVersion(59998);
  assert.strictEqual(result.reachable, false);
  assert.ok(result.error);
  assert.ok(result.suggestedFix);
  assert.ok(result.suggestedFix.includes('--remote-debugging-port=59998'));
});

test('probeCDPVersion parses version metadata from reachable CDP', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/json/version') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        Browser: 'Chrome/128.0.6613.120',
        'Protocol-Version': '1.3',
        'User-Agent': 'Mozilla/5.0 Mock',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/abc-123',
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const result = await probeCDPVersion(port);
    assert.strictEqual(result.reachable, true);
    assert.strictEqual(result.browser, 'Chrome/128.0.6613.120');
    assert.strictEqual(result.userAgent, 'Mozilla/5.0 Mock');
    assert.ok(result.webSocketDebuggerUrl.includes('abc-123'));
  } finally {
    server.close();
  }
});

test('runDoctor returns failure object when CDP is unreachable without throwing', async () => {
  const result = await runDoctor({ port: 59997, silent: true });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.cdpReachable, false);
  assert.ok(result.recommendation);
});
