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
  let readyResolve: ((v: boolean) => void) | null = null;
  let readyReject: ((e: unknown) => void) | null = null;
  let readyTimer: number | null = null;
  let readyPromise: Promise<boolean> | null = null;
  let handshakeInFlight: Promise<boolean> | null = null;
  let listenerAttached = false;

  let reqSeq = 1;
  const pending = new Map<string, {
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
    timer: number;
  }>();
  const queue: TDomainShakePostMessage[] = [];

  function isOriginAllowed(origin: string): boolean {
    if (allowedOrigins.length === 0) return false;
    return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
  }

  function attachMessageListener() {
    if (listenerAttached) return;
    window.addEventListener('message', onMessage as EventListener);
    listenerAttached = true;
  }

  function resetHandshakeState() {
    isReady = false;
    if (readyTimer !== null) {
      window.clearTimeout(readyTimer);
      readyTimer = null;
    }
    readyPromise = new Promise<boolean>((res, rej) => {
      readyResolve = res;
      readyReject = rej;
    });
  }

  function openAndHandshake(): Promise<boolean> {
    if (isReady && partnerWin && !partnerWin.closed) {
      return Promise.resolve(true);
    }
    if (handshakeInFlight) return handshakeInFlight;

    attachMessageListener();
    resetHandshakeState();

    partnerWin = window.open(partnerUrl, '_blank', features);
    if (!partnerWin) {
      const err = new Error('Popup blocked: cannot open partner window');
      readyReject?.(err);
      return Promise.reject(err);
    }

    readyTimer = window.setTimeout(() => {
      readyReject?.(new Error('Handshake timeout: no READY from child'));
      readyTimer = null;
    }, handshakeTimeoutMs);

    handshakeInFlight = (readyPromise as Promise<boolean>).finally(() => {
      handshakeInFlight = null;
    });
    return handshakeInFlight;
  }

  function onMessage(event: MessageEvent) {
    if (!partnerWin || event.source !== partnerWin) return;
    if (!isOriginAllowed(event.origin)) return;

    const data = event.data as TDomainShakePostMessage | undefined;
    if (!data || (data as { __dshake__?: boolean }).__dshake__ !== true) return;

    if (data.type === 'READY') {
      isReady = true;
      if (readyTimer !== null) {
        window.clearTimeout(readyTimer);
        readyTimer = null;
      }
      readyResolve?.(true);
      while (queue.length && partnerWin && !partnerWin.closed) {
        partnerWin.postMessage(queue.shift() as TDomainShakePostMessage, partnerOrigin);
      }
      return;
    }

    if (data.type === 'RESPONSE') {
      const { requestId, success, payload, error } = data as TResponseMessage;
      const entry = pending.get(requestId);
      if (!entry) return;
      window.clearTimeout(entry.timer);
      pending.delete(requestId);
      success ? entry.resolve(payload) : entry.reject(new Error(error || 'Unknown error'));
    }
  }

  function send(action: string, payload?: unknown, timeoutMs = requestTimeoutMs): Promise<unknown> {
    const requestId = `req_${Date.now()}_${reqSeq++}`;
    const msg: TDomainShakePostMessage = { __dshake__: true, type: 'REQUEST', requestId, action, payload };

    const p = new Promise<unknown>((resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      const timer = window.setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Request timeout: ${action}`));
      }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
    });

    const unavailable = !partnerWin || partnerWin.closed;
    if (unavailable) {
      queue.push(msg);
      void openAndHandshake().catch((err: unknown) => {
        const entry = pending.get(requestId);
        if (entry) {
          window.clearTimeout(entry.timer);
          pending.delete(requestId);
          entry.reject(err);
        }
      });
      return p;
    }

    if (!isReady) queue.push(msg);
    else (partnerWin as Window).postMessage(msg, partnerOrigin);

    return p;
  }

  function close() {
    try {
      window.removeEventListener('message', onMessage as EventListener);
      listenerAttached = false;
    } catch {}

    if (readyTimer !== null) {
      window.clearTimeout(readyTimer);
      readyTimer = null;
    }

    readyReject?.(new Error('Bridge closed'));
    handshakeInFlight = null;

    pending.forEach(({ reject, timer }) => {
      window.clearTimeout(timer);
      reject(new Error('Bridge closed'));
    });
    pending.clear();
    queue.length = 0;
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
