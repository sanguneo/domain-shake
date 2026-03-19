function createPeerResponderBridge({
  openerOrigin,
  allowedOrigins = [openerOrigin],
  handlers = {},
  readyDelayMs = 0
}) {
  let openerRealOrigin = null;
  const _handlers = Object.assign({}, handlers);
  function isOriginAllowed(origin) {
    if (allowedOrigins.length === 0) return false;
    return allowedOrigins.includes("*") || allowedOrigins.includes(origin);
  }
  function isDshake(data) {
    return typeof data === "object" && data !== null && data.__dshake__ === true;
  }
  function onMessage(event) {
    if (event.source !== window.opener) return;
    openerRealOrigin = event.origin;
    if (!isOriginAllowed(event.origin)) return;
    const data = event.data;
    if (!isDshake(data) || data.type !== "REQUEST") return;
    const { requestId, action, payload } = data;
    void handleRequest(event.source, event.origin, requestId, action, payload);
  }
  async function handleRequest(targetWin, targetOrigin, requestId, action, payload) {
    const handler = _handlers[action];
    if (!handler) {
      targetWin.postMessage({ __dshake__: true, type: "RESPONSE", requestId, success: false, error: `Unknown action: ${action}` }, targetOrigin);
      return;
    }
    try {
      const result = await handler(payload);
      targetWin.postMessage({ __dshake__: true, type: "RESPONSE", requestId, success: true, payload: result }, targetOrigin);
    } catch (err) {
      const message = err.message || String(err);
      targetWin.postMessage({ __dshake__: true, type: "RESPONSE", requestId, success: false, error: message }, targetOrigin);
    }
  }
  function sendReady() {
    if (!window.opener) return;
    const targetOrigin = openerRealOrigin || (allowedOrigins.includes("*") ? "*" : openerOrigin);
    window.opener.postMessage({ __dshake__: true, type: "READY" }, targetOrigin);
  }
  function start() {
    window.addEventListener("message", onMessage);
    if (readyDelayMs > 0) {
      setTimeout(sendReady, readyDelayMs);
    } else {
      if (document.readyState === "complete") sendReady();
      else window.addEventListener("load", sendReady, { once: true });
    }
  }
  function stop() {
    try {
      window.removeEventListener("message", onMessage);
    } catch {
    }
  }
  function addHandler(action, handler) {
    _handlers[action] = handler;
    return true;
  }
  return { start, stop, addHandler };
}
export {
  createPeerResponderBridge
};
