# domain-shake

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![Build](https://img.shields.io/badge/build-esbuild-ffcf00.svg)](https://esbuild.github.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

Tiny, dependency-free bridge for **trusted cross-window RPC** on top of `postMessage`.

`domain-shake` gives you a handshake protocol, request/response correlation, timeout control, and origin filtering so you can treat `window.open()` + `postMessage` like a minimal RPC channel.

## Why Use This?

Raw `postMessage` gets messy fast:
- no handshake state
- no request ID correlation
- no built-in timeout handling
- easy to leak messages across origins
- awkward reconnect logic when popup navigates/reloads

`domain-shake` solves these with a focused protocol:
- **Handshake-gated messaging** (`READY` before flush)
- **Request/Response RPC semantics** (`requestId`, promise-based)
- **Per-request timeout + bridge-level lifecycle control**
- **Explicit origin allow-list** (including optional `*` mode)
- **Re-handshake friendly flow** for popup lifecycle churn
- **ESM + global builds** for modern and legacy embedding

## Mental Model

```text
Initiator (A)                             Responder (B)
--------------                            --------------
openAndHandshake()   -- window.open -->   start()
(wait READY)         <-- READY -------    sendReady()
send(action,payload) --> REQUEST ----->   handler(action)
(await Promise)      <-- RESPONSE ----    postMessage(result)
```

## Installation

```bash
npm i domain-shake
```

Or copy files directly if you use source vendoring.

## Quick Start (ESM)

### 1) Initiator page (opener)

```html
<script type="module">
  import { createPeerInitiatorBridge } from './js/peerInitiator.js';

  const bridge = createPeerInitiatorBridge({
    partnerUrl: 'https://b.example.com/receiver.html',
    partnerOrigin: 'https://b.example.com',
    allowedOrigins: ['https://b.example.com'],
    handshakeTimeoutMs: 15000,
    requestTimeoutMs: 20000,
  });

  await bridge.openAndHandshake();

  const result = await bridge.send('DO_SOMETHING', { x: 1 });
  console.log(result);
</script>
```

### 2) Responder page (popup/tab)

```html
<script type="module">
  import { createPeerResponderBridge } from './js/peerResponder.js';

  const bridge = createPeerResponderBridge({
    openerOrigin: 'https://a.example.com',
    allowedOrigins: ['https://a.example.com'],
    handlers: {
      DO_SOMETHING: async (payload) => ({ ok: true, got: payload }),
    },
  });

  bridge.start();
</script>
```

## Global Build Usage (No Module Loader)

```html
<script src="./js/peerInitiator.global.js"></script>
<script>
  const bridge = createPeerInitiatorBridge({
    partnerUrl: 'https://b.example.com/receiver.html',
    partnerOrigin: 'https://b.example.com',
    allowedOrigins: ['https://b.example.com'],
  });
</script>
```

Responder:

```html
<script src="./js/peerResponder.global.js"></script>
<script>
  const bridge = createPeerResponderBridge({
    openerOrigin: 'https://a.example.com',
    allowedOrigins: ['https://a.example.com'],
    handlers: {
      PING: () => 'PONG',
    },
  });
  bridge.start();
</script>
```

## API

### `createPeerInitiatorBridge(options)`

Options:
- `partnerUrl: string` - URL to open
- `partnerOrigin: string` - expected origin for postMessage target
- `allowedOrigins?: string[]` - accepted origins for incoming messages
- `features?: string` - `window.open` feature string
- `handshakeTimeoutMs?: number` - handshake timeout
- `requestTimeoutMs?: number` - default request timeout

Methods:
- `openAndHandshake(): Promise<boolean>`
- `send(action: string, payload?: unknown, timeoutMs?: number): Promise<unknown>`
- `close(): void`
- `isReady: boolean` (getter)

### `createPeerResponderBridge(options)`

Options:
- `openerOrigin: string`
- `allowedOrigins?: string[]`
- `handlers?: Record<string, (payload) => unknown | Promise<unknown>>`
- `readyDelayMs?: number`

Methods:
- `start(): void`
- `stop(): void`
- `addHandler(action: string, handler: Handler): true`

## Security Notes

- Prefer strict allow-lists: `allowedOrigins: ['https://trusted.example']`
- Use `'*'` only when you fully understand the blast radius
- Never pass secrets in plaintext payloads unless transport context is trusted
- Validate payload shape in handlers (zod/io-ts/custom validators)

## Reconnect / Popup Navigation

If the popup reloads, redirects, or closes, the initiator can recover by re-running handshake flow. `domain-shake` keeps queued requests and resumes dispatch after `READY`.

Recommended pattern:

```js
try {
  await bridge.send('FETCH_PROFILE');
} catch (e) {
  await bridge.openAndHandshake();
  await bridge.send('FETCH_PROFILE');
}
```

## Development

```bash
npm run typecheck
npm run build
```

Build outputs:
- `js/peerInitiator.js`
- `js/peerResponder.js`
- `js/dshake.types.js`
- `js/peerInitiator.global.js`
- `js/peerResponder.global.js`

## When Not To Use

- Same-origin, same-frame communication (just call functions directly)
- Heavy streaming/binary transport requirements
- Complex multi-peer routing (consider MessageChannel/BroadcastChannel/WebSocket)

## License

MIT
