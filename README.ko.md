# domain-shake

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![Build](https://img.shields.io/badge/build-esbuild-ffcf00.svg)](https://esbuild.github.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

`postMessage` 위에 올리는 **신뢰 기반 cross-window RPC 브리지**.

`domain-shake`는 `window.open()` + `postMessage`를 실무에서 바로 쓸 수 있게,
핸드셰이크/요청-응답 상관관계/타임아웃/오리진 필터링을 제공하는 작은 프로토콜 레이어입니다.

## 왜 이 모듈을 써야 하나?

순수 `postMessage`만 쓰면 금방 복잡해집니다.
- 핸드셰이크 상태 관리가 직접 구현 대상
- 요청/응답 매칭 로직(requestId) 직접 구현
- 타임아웃/정리 로직 누락으로 메모리 누수 위험
- origin 검증 실수로 보안 사고 가능성
- 팝업 이동/리로드 후 재연결 로직 난해

`domain-shake`는 아래를 기본으로 제공합니다.
- **핸드셰이크 게이팅** (`READY` 이후 큐 flush)
- **Promise 기반 RPC** (`REQUEST`/`RESPONSE`)
- **요청 단위 타임아웃 + 브리지 라이프사이클 제어**
- **명시적 allow-list 오리진 검증** (`*` 옵션 포함)
- **팝업 라이프사이클 변화에 대응 가능한 재핸드셰이크 흐름**
- **ESM + global 빌드 동시 제공**

## 동작 모델

```text
Initiator (A)                             Responder (B)
--------------                            --------------
openAndHandshake()   -- window.open -->   start()
(wait READY)         <-- READY -------    sendReady()
send(action,payload) --> REQUEST ----->   handler(action)
(await Promise)      <-- RESPONSE ----    postMessage(result)
```

## 설치

```bash
npm i domain-shake
```

## 빠른 시작 (ESM)

### 1) Initiator (opener)

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

### 2) Responder (popup/tab)

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

## Global 빌드 사용법 (모듈 로더 없이)

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

옵션:
- `partnerUrl: string` - 열 대상 URL
- `partnerOrigin: string` - postMessage target origin
- `allowedOrigins?: string[]` - 수신 메시지 허용 origin 목록
- `features?: string` - `window.open` 옵션 문자열
- `handshakeTimeoutMs?: number` - 핸드셰이크 타임아웃
- `requestTimeoutMs?: number` - 기본 요청 타임아웃

메서드:
- `openAndHandshake(): Promise<boolean>`
- `send(action: string, payload?: unknown, timeoutMs?: number): Promise<unknown>`
- `close(): void`
- `isReady: boolean` (getter)

### `createPeerResponderBridge(options)`

옵션:
- `openerOrigin: string`
- `allowedOrigins?: string[]`
- `handlers?: Record<string, (payload) => unknown | Promise<unknown>>`
- `readyDelayMs?: number`

메서드:
- `start(): void`
- `stop(): void`
- `addHandler(action: string, handler: Handler): true`

## 보안 가이드

- 가능한 한 엄격한 allow-list를 사용하세요:
  `allowedOrigins: ['https://trusted.example']`
- `'*'`는 리스크를 이해한 경우에만 사용하세요
- 민감 데이터는 신뢰된 맥락이 아니면 평문 전달하지 마세요
- handler 내부에서 payload 스키마를 검증하세요

## 재연결 / 팝업 이동 대응

팝업이 리로드/리다이렉트/종료되면 재핸드셰이크가 필요합니다.
`domain-shake`는 큐잉된 요청을 유지하고 `READY` 수신 후 재전송할 수 있습니다.

권장 패턴:

```js
try {
  await bridge.send('FETCH_PROFILE');
} catch (e) {
  await bridge.openAndHandshake();
  await bridge.send('FETCH_PROFILE');
}
```

## 개발

```bash
npm run typecheck
npm run build
```

빌드 산출물:
- `js/peerInitiator.js`
- `js/peerResponder.js`
- `js/dshake.types.js`
- `js/peerInitiator.global.js`
- `js/peerResponder.global.js`

## 이 모듈이 맞지 않는 경우

- 같은 origin/같은 프레임 내 단순 호출만 필요한 경우
- 고용량 스트리밍/바이너리 전송이 핵심인 경우
- 다수 peer 라우팅/브로커링이 필요한 경우

## 라이선스

MIT
