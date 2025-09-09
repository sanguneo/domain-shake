type Options = {
    partnerUrl: string;
    partnerOrigin: string;
    allowedOrigins?: string[];
    features?: string;
    handshakeTimeoutMs?: number;
    requestTimeoutMs?: number;
};
export declare function createPeerInitiatorBridge({ partnerUrl, partnerOrigin, allowedOrigins, features, handshakeTimeoutMs, requestTimeoutMs, }: Options): {
    openAndHandshake: () => Promise<boolean>;
    send: (action: string, payload?: unknown, timeoutMs?: number) => Promise<unknown>;
    close: () => void;
    readonly isReady: boolean;
};
export {};
