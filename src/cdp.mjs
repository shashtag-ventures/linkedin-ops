/**
 * cdp.mjs — WebSocket-based Chrome DevTools Protocol Client
 */

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function createCDPClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      }
    } catch {}
  };

  return {
    async open() {
      if (ws.readyState === WebSocket.OPEN) return;
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', reject, { once: true });
      });
    },

    async send(method, params = {}, timeoutMs = 15000) {
      await this.open();
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            resolve(null); // Return null on timeout to allow graceful handling
          }
        }, timeoutMs);
        pending.set(id, {
          resolve: (val) => { clearTimeout(timer); resolve(val); },
          reject: (err) => { clearTimeout(timer); reject(err); },
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },

    async evaluate(fnStrOrExpr, ...args) {
      let timeoutMs = 12000;
      let fnArgs = [];

      const trimmed = (typeof fnStrOrExpr === 'string' ? fnStrOrExpr : String(fnStrOrExpr)).trim();

      if (args.length === 1 && typeof args[0] === 'number') {
        timeoutMs = args[0];
      } else if (args.length > 0) {
        fnArgs = args;
      }

      let expression;
      if (fnArgs.length > 0) {
        expression = `(${trimmed})(${fnArgs.map(a => JSON.stringify(a)).join(', ')})`;
      } else if (trimmed.endsWith(')()')) {
        expression = trimmed;
      } else if (trimmed.startsWith('()') || trimmed.startsWith('function') || trimmed.startsWith('async (')) {
        expression = `(${trimmed})()`;
      } else {
        expression = trimmed;
      }
      try {
        const res = await this.send('Runtime.evaluate', {
          expression,
          returnByValue: true,
          awaitPromise: true,
        }, timeoutMs);
        if (res?.exceptionDetails) {
          const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Runtime evaluation error';
          console.warn(`[CDP] ⚠️ Evaluation error: ${desc}`);
          return undefined;
        }
        return res?.result?.value;
      } catch (err) {
        if (err.message && (err.message.includes('navigated') || err.message.includes('closed') || err.message.includes('destroyed'))) {
          return undefined;
        }
        throw err;
      }
    },

    async navigate(url, waitMs = 3500) {
      await this.send('Page.navigate', { url });
      if (waitMs > 0) await delay(waitMs);
    },

    async cleanOverlays() {
      return this.evaluate(`() => {
        document.querySelectorAll('.msg-overlay-list-bubble, .msg-overlay-container').forEach(el => el.remove());
      }`);
    },

    close() {
      try {
        ws.close();
      } catch {}
    },
  };
}
