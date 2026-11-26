// SPIKE (docs/maze/LIVE-PLAN-1.md): the few Workers runtime types the live spike uses, declared by
// hand so the web app's tsc (Node types) can check worker/. The real Contact build replaces this
// with generated types (`wrangler types`).

interface CfWebSocket {
  accept(): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'message', fn: (e: { data: string | ArrayBuffer }) => void): void;
  addEventListener(type: 'close' | 'error', fn: () => void): void;
  readyState: number;
}

declare const WebSocketPair: { new (): { 0: CfWebSocket; 1: CfWebSocket } };

interface CfResponseInit extends ResponseInit {
  webSocket?: CfWebSocket;
}

interface CfDurableObjectId {
  toString(): string;
}

interface CfDurableObjectStub {
  fetch(req: Request): Promise<Response>;
}

interface CfDurableObjectNamespace {
  idFromName(name: string): CfDurableObjectId;
  get(id: CfDurableObjectId): CfDurableObjectStub;
}

interface CfExecutionContext {
  waitUntil(p: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface LiveSpikeEnv {
  LIVE_SPIKE?: string;
  LIVE_SPIKE_ROOM: CfDurableObjectNamespace;
}
