# domain-shake

## 소개
`domain-shake`는 두 개의 독립적인 창 사이에 신뢰할 수 있는 통신 채널을 구축하는
소형 브라우저 모듈 쌍을 제공합니다. 이 모듈들은 `postMessage` API를 사용하며
최신 Chrome 및 Edge 환경을 대상으로 합니다.

## 목적
`peerInitiator`는 파트너 창을 열고 요청 전송 전에 핸드셰이크를 수행하며, 
`peerResponder`는 열린 창에 상주하여 해당 요청을 사용자 정의 핸들러로 전달합니다. 
이를 통해 번들링이나 명령줄 런타임에 의존하지 않고도 크로스 오리진 페이지 간 데이터 교환이 가능합니다.

## 사용법
### Initiator
```html
<script type="module">
import { createPeerInitiatorBridge } from './js/peerInitiator.js';

const bridge = createPeerInitiatorBridge({
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

## 주의사항
- 데이터 유출을 방지하려면 `allowedOrigins`를 항상 신뢰할 수 있는 도메인으로 제한하십시오.
- 팝업 차단기가 initiator가 responder 창을 여는 것을 막을 수 있습니다.
- 처리되지 않은 요청은 약속이 멈추는 것을 방지하기 위해 시간 초과됩니다.
- 모듈은 번들러와 함께 제공되지 않습니다. 소스 코드를 트랜스파일하거나 압축해야 할 경우 기존 빌드 파이프라인을 사용하십시오.

## 개발
타입 검사는 TypeScript만 사용합니다:

```bash
npx tsc --noEmit
```

자바스크립트가 생성되지 않으므로 모듈은 소스 코드 전용으로 유지됩니다.
