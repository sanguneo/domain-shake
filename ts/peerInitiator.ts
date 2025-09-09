// peerInitiator.ts
// Usage:
//   const bridge = createPeerInitiatorBridge({
//     partnerUrl: 'https://b.example.com/receiver.html',
//     partnerOrigin: 'https://b.example.com',
//     allowedOrigins: ['https://b.example.com'],
//   });
//   await bridge.openAndHandshake();
//   const result = await bridge.send('DO_SOMETHING', { x: 1 });

import type { TDomainShakePostMessage, TResponseMessage } from './dshake.types';

type Options = {
  partnerUrl: string;
  partnerOrigin: string;
  allowedOrigins?: string[];
  features?: string;
  handshakeTimeoutMs?: number;
  requestTimeoutMs?: number;
};

export function createPeerInitiatorBridge({
  partnerUrl,
  partnerOrigin,
  allowedOrigins = [partnerOrigin],
  features = 'popup,width=900,height=700',
  handshakeTimeoutMs = 15000,
  requestTimeoutMs = 20000,
}: Options) {
  let partnerWin: Window | null = null;
  let isReady = false;
  let readyResolve!: (v: boolean) => void;
  let readyReject!: (e: unknown) => void;
  let readyTimer: number | null = null;

  const readyPromise = new Promise<boolean>((res: (v: boolean) => void, rej: (e: unknown) => void) => {
    readyResolve = res;
    readyReject = rej;
  });

  let reqSeq = 1;
  const pending = new Map<string, {
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
    timer: number;
  }>();
  const queue: TDomainShakePostMessage[] = [];

  function openAndHandshake(): Promise<boolean> {
    partnerWin = window.open(partnerUrl, '_blank', features);
    if (!partnerWin) throw new Error('Popup blocked: cannot open partner window');

    readyTimer = window.setTimeout(() => {
      readyReject(new Error('Handshake timeout: no READY from child'));
    }, handshakeTimeoutMs);

    window.addEventListener('message', onMessage as EventListener);
    return readyPromise;
  }

  function onMessage(event: MessageEvent) {
    if (!partnerWin || event.source !== partnerWin) return;
    if (!allowedOrigins.includes(event.origin)) return;

    const data = event.data as TDomainShakePostMessage | undefined;
    if (!data || (data as { __dshake__?: boolean }).__dshake__ !== true) return;

    if (data.type === 'READY') {
      isReady = true;
      if (readyTimer) window.clearTimeout(readyTimer);
      readyResolve(true);
      while (queue.length) partnerWin.postMessage(queue.shift()!, partnerOrigin);
      return;
    }

    if (data.type === 'RESPONSE') {
      const { requestId, success, payload, error } = data as TResponseMessage;
      const entry = pending.get(requestId);
      if (!entry) return;
      window.clearTimeout(entry.timer);
      pending.delete(requestId);
      success ? entry.resolve(payload) : entry.reject(new Error(error || 'Unknown error'));
      return;
    }
  }

  function send(action: string, payload?: unknown, timeoutMs = requestTimeoutMs): Promise<unknown> {
    if (!partnerWin || partnerWin.closed) throw new Error('Partner window not available');
    const requestId = `req_${Date.now()}_${reqSeq++}`;
    const msg: TDomainShakePostMessage = { __dshake__: true, type: 'REQUEST', requestId, action, payload };

    const p = new Promise<unknown>((resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      const timer = window.setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Request timeout: ${action}`));
      }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
    });

    if (!isReady) queue.push(msg);
    else partnerWin.postMessage(msg, partnerOrigin);

    return p;
  }

  function close() {
    try { window.removeEventListener('message', onMessage as EventListener); } catch {}
    pending.forEach(({ reject, timer }) => {
      window.clearTimeout(timer); reject(new Error('Bridge closed'));
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
