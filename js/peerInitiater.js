// peerInitiater.js
// Usage:
//   const bridge = createPeerInitiaterBridge({
//     partnerUrl: 'https://b.example.com/receiver.html',
//     partnerOrigin: 'https://b.example.com',
//     allowedOrigins: ['https://b.example.com'],
//   });
//   await bridge.openAndHandshake();
//   const result = await bridge.send('DO_SOMETHING', { x: 1 });

export function createPeerInitiaterBridge({
  partnerUrl,
  partnerOrigin,
  allowedOrigins = [partnerOrigin],
  features = 'popup,width=900,height=700',
  handshakeTimeoutMs = 15000,
  requestTimeoutMs = 20000,
} = {}) {
  let partnerWin = null;
  let isReady = false;
  let readyResolve;
  let readyReject;
  let readyTimer = null;

  const readyPromise = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });

  let reqSeq = 1;
  const pending = new Map(); // requestId -> {resolve, reject, timer}
  const queue = []; // messages queued before READY

  function openAndHandshake() {
    partnerWin = window.open(partnerUrl, '_blank', features);
    if (!partnerWin) throw new Error('Popup blocked: cannot open partner window');

    // start handshake timeout
    readyTimer = setTimeout(() => {
      readyReject(new Error('Handshake timeout: no READY from child'));
    }, handshakeTimeoutMs);

    // listen once here (idempotent: we guard multiple adds)
    window.addEventListener('message', onMessage);
    return readyPromise;
  }

  function onMessage(event) {
    const { origin, source, data } = event;
    if (!source || source !== partnerWin) return;
    if (!allowedOrigins.includes(origin)) return; // SECURITY

    if (!data || typeof data !== 'object' || data.__dshake__ !== true) return;

    const { type } = data;

    if (type === 'READY') {
      isReady = true;
      clearTimeout(readyTimer);
      readyResolve(true);
      // flush queue
      while (queue.length) {
        const msg = queue.shift();
        partnerWin.postMessage(msg, partnerOrigin);
      }
      return;
    }

    if (type === 'RESPONSE') {
      const { requestId, success, payload, error } = data;
      const entry = pending.get(requestId);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(requestId);
      success ? entry.resolve(payload) : entry.reject(new Error(error || 'Unknown error'));
      return;
    }
  }

  function send(action, payload, { timeoutMs = requestTimeoutMs } = {}) {
    if (!partnerWin || partnerWin.closed) throw new Error('Partner window not available');
    const requestId = `req_${Date.now()}_${reqSeq++}`;
    const msg = {
      __dshake__: true,
      type: 'REQUEST',
      requestId,
      action,
      payload,
    };

    const p = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Request timeout: ${action}`));
      }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
    });

    if (!isReady) {
      queue.push(msg);
    } else {
      partnerWin.postMessage(msg, partnerOrigin);
    }
    return p;
  }

  function close() {
    try { window.removeEventListener('message', onMessage); } catch {}
    pending.forEach(({ reject, timer }) => {
      clearTimeout(timer); reject(new Error('Bridge closed'));
    });
    pending.clear();
    isReady = false;
    if (partnerWin && !partnerWin.closed) partnerWin.close();
    partnerWin = null;
  }

  return {
    openAndHandshake,
    send,
    close,
    get isReady() { return isReady; },
  };
}
