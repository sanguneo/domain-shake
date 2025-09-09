// peerResponder.js
// Usage:
//   const bridge = createPeerResponderBridge({
//     openerOrigin: 'https://a.example.com',
//     allowedOrigins: ['https://a.example.com'],
//     handlers: {
//       DO_SOMETHING: async (payload) => { return { ok: true, got: payload }; },
//     },
//   });
//   bridge.start();

export function createPeerResponderBridge({
  openerOrigin,
  allowedOrigins = [openerOrigin],
  handlers = {},
  readyDelayMs = 0, // SPA에서 앱 초기화가 끝난 후 READY를 늦출 때 사용
} = {}) {
  function safeParse(data) {
    return (data && typeof data === 'object' && data.__dshake__ === true) ? data : null;
  }

  function onMessage(event) {
    const { origin, source, data } = event;
    if (!source || source !== window.opener) return;
    if (!allowedOrigins.includes(origin)) return; // SECURITY
    const msg = safeParse(data);
    if (!msg) return;

    if (msg.type === 'REQUEST') {
      const { requestId, action, payload } = msg;
      handleRequest(source, origin, requestId, action, payload);
    }
  }

  async function handleRequest(targetWin, targetOrigin, requestId, action, payload) {
    const handler = handlers[action];
    if (!handler) {
      return targetWin.postMessage({
        __dshake__: true,
        type: 'RESPONSE',
        requestId,
        success: false,
        error: `Unknown action: ${action}`,
      }, targetOrigin);
    }
    try {
      const result = await handler(payload);
      targetWin.postMessage({
        __dshake__: true,
        type: 'RESPONSE',
        requestId,
        success: true,
        payload: result,
      }, targetOrigin);
    } catch (err) {
      targetWin.postMessage({
        __dshake__: true,
        type: 'RESPONSE',
        requestId,
        success: false,
        error: err?.message || String(err),
      }, targetOrigin);
    }
  }

  function sendReady() {
    if (!window.opener) return;
    window.opener.postMessage({ __dshake__: true, type: 'READY' }, openerOrigin);
  }

  function start() {
    window.addEventListener('message', onMessage);
    // SPA 자원/데이터가 다 준비된 시점에 READY를 보내고 싶으면 readyDelayMs 조정
    if (readyDelayMs > 0) setTimeout(sendReady, readyDelayMs);
    else {
      if (document.readyState === 'complete') sendReady();
      else window.addEventListener('load', sendReady, { once: true });
    }
  }

  function stop() {
    try { window.removeEventListener('message', onMessage); } catch {}
  }

  return { start, stop };
}
