// peerResponder.ts
import type { HandlerMap, TDomainShakePostMessage, TRequestMessage } from './dshake.types';

type Options = {
  openerOrigin: string;
  allowedOrigins?: string[];
  handlers?: HandlerMap;
  readyDelayMs?: number;
};

export function createPeerResponderBridge({
  openerOrigin,
  allowedOrigins = [openerOrigin],
  handlers = {},
  readyDelayMs = 0,
}: Options) {
  function isXpost(data: unknown): data is TDomainShakePostMessage {
    return typeof data === 'object' && data !== null && (data as { __dshake__?: boolean }).__dshake__ === true;
  }

  function onMessage(event: MessageEvent) {
    if (event.source !== window.opener) return;
    if (!allowedOrigins.includes(event.origin)) return;

    const data = event.data;
    if (!isXpost(data) || data.type !== 'REQUEST') return;

    const { requestId, action, payload } = data as TRequestMessage;
    void handleRequest(event.source as Window, event.origin, requestId, action, payload);
  }

  async function handleRequest(targetWin: Window, targetOrigin: string, requestId: string, action: string, payload: unknown) {
    const handler = handlers[action];
    if (!handler) {
      targetWin.postMessage({ __dshake__: true, type: 'RESPONSE', requestId, success: false, error: `Unknown action: ${action}` }, targetOrigin);
      return;
    }
    try {
      const result = await handler(payload);
      targetWin.postMessage({ __dshake__: true, type: 'RESPONSE', requestId, success: true, payload: result }, targetOrigin);
    } catch (err: unknown) {
      const message = (err as { message?: string }).message || String(err);
      targetWin.postMessage({ __dshake__: true, type: 'RESPONSE', requestId, success: false, error: message }, targetOrigin);
    }
  }

  function sendReady() {
    if (!window.opener) return;
    window.opener.postMessage({ __dshake__: true, type: 'READY' }, openerOrigin);
  }

  function start() {
    window.addEventListener('message', onMessage as EventListener);
    if (readyDelayMs > 0) setTimeout(sendReady, readyDelayMs);
    else {
      if (document.readyState === 'complete') sendReady();
      else window.addEventListener('load', sendReady, { once: true });
    }
  }

  function stop() {
    try { window.removeEventListener('message', onMessage as EventListener); } catch {}
  }

  return { start, stop };
}
