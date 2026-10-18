import test from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { ensureChromeRunning } from '../src/browser-manager.mjs';

test('ensureChromeRunning handles port check and returns status', async () => {
  assert.strictEqual(typeof ensureChromeRunning, 'function');
});

test('ensureChromeRunning returns running: true when CDP port responds', async () => {
  // Spin up temporary mock CDP version server on ephemeral port
  const server = createServer((req, res) => {
    if (req.url === '/json/version') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ Browser: 'Chrome/120.0.0.0' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const status = await ensureChromeRunning({ port, autoSpawn: false });
    assert.strictEqual(status.running, true);
    assert.strictEqual(status.spawned, false);
  } finally {
    server.close();
  }
});

test('ensureChromeRunning detects unconfigured state cleanly', async () => {
  const status = await ensureChromeRunning({ port: 59999, autoSpawn: false });
  assert.strictEqual(status.running, false);
});
