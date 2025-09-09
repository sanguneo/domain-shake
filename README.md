# domain-shake

## Introduction
`domain-shake` provides a tiny pair of browser modules that establish a trusted
communication channel between two independent windows. The modules use the
`postMessage` API and are intended for modern Chrome and Edge environments.

## Purpose
`peerInitiater` opens a partner window and performs a handshake before sending
requests, while `peerResponder` lives in the opened window and dispatches those
requests to user‑defined handlers. This enables cross‑origin pages to exchange
data without bundling or relying on a command‑line runtime.

## Usage
### Initiater
```html
<script type="module">
import { createPeerInitiaterBridge } from './js/peerInitiater.js';

const bridge = createPeerInitiaterBridge({
  partnerUrl: 'https://b.example.com/receiver.html',
  partnerOrigin: 'https://b.example.com',
  allowedOrigins: ['https://b.example.com']
});

await bridge.openAndHandshake();
const result = await bridge.send('DO_SOMETHING', { x: 1 });
console.log(result);
</script>
```

### Responder
```html
<script type="module">
import { createPeerResponderBridge } from './js/peerResponder.js';

const bridge = createPeerResponderBridge({
  openerOrigin: 'https://a.example.com',
  handlers: {
    DO_SOMETHING: async payload => ({ ok: true, got: payload })
  }
});

bridge.start();
</script>
```

## Caution
- Always restrict `allowedOrigins` to trusted domains to avoid leaking data.
- Popup blockers may prevent the initiater from opening the responder window.
- Unhandled requests time out to prevent hanging promises.
- The modules are not shipped with a bundler; use your existing build pipeline
  if you need to transpile or minify the source.

## Development
Type checking uses TypeScript only:

```bash
npx tsc --noEmit
```

No JavaScript is emitted, so the modules remain source‑only.
