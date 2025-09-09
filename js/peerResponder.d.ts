import type { HandlerMap } from './dshake.types';
type Options = {
    openerOrigin: string;
    allowedOrigins?: string[];
    handlers?: HandlerMap;
    readyDelayMs?: number;
};
export declare function createPeerResponderBridge({ openerOrigin, allowedOrigins, handlers, readyDelayMs, }: Options): {
    start: () => void;
    stop: () => void;
};
export {};
