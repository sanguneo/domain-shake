export function createPeerResponderBridge({ openerOrigin, allowedOrigins = [openerOrigin], handlers = {}, readyDelayMs = 0, }) {
    function isXpost(data) {
        return data && typeof data === 'object' && data.__dshake__ === true;
    }
    function onMessage(event) {
        if (event.source !== window.opener)
            return;
        if (!allowedOrigins.includes(event.origin))
            return;
        const data = event.data;
        if (!isXpost(data) || data.type !== 'REQUEST')
            return;
        const { requestId, action, payload } = data;
        void handleRequest(event.source, event.origin, requestId, action, payload);
    }
    async function handleRequest(targetWin, targetOrigin, requestId, action, payload) {
        const handler = handlers[action];
        if (!handler) {
            targetWin.postMessage({ __dshake__: true, type: 'RESPONSE', requestId, success: false, error: `Unknown action: ${action}` }, targetOrigin);
            return;
        }
        try {
            const result = await handler(payload);
            targetWin.postMessage({ __dshake__: true, type: 'RESPONSE', requestId, success: true, payload: result }, targetOrigin);
        }
        catch (err) {
            targetWin.postMessage({ __dshake__: true, type: 'RESPONSE', requestId, success: false, error: (err === null || err === void 0 ? void 0 : err.message) || String(err) }, targetOrigin);
        }
    }
    function sendReady() {
        if (!window.opener)
            return;
        window.opener.postMessage({ __dshake__: true, type: 'READY' }, openerOrigin);
    }
    function start() {
        window.addEventListener('message', onMessage);
        if (readyDelayMs > 0)
            setTimeout(sendReady, readyDelayMs);
        else {
            if (document.readyState === 'complete')
                sendReady();
            else
                window.addEventListener('load', sendReady, { once: true });
        }
    }
    function stop() {
        try {
            window.removeEventListener('message', onMessage);
        }
        catch (_a) { }
    }
    return { start, stop };
}
