// dshake.types.ts
export type TDomainShakePostMessageBase = { __dshake__: true };
export type TReadyMessage = TDomainShakePostMessageBase & { type: 'READY' };

export type TRequestMessage = TDomainShakePostMessageBase & {
  type: 'REQUEST';
  requestId: string;
  action: string;
  payload?: unknown;
};

export type TResponseMessage = TDomainShakePostMessageBase & {
  type: 'RESPONSE';
  requestId: string;
  success: boolean;
  payload?: unknown;
  error?: string;
};

export type TDomainShakePostMessage = TReadyMessage | TRequestMessage | TResponseMessage;

export type Handler = (payload: unknown) => unknown | Promise<unknown>;
export type HandlerMap = Record<string, Handler>;
