export const WEBSOCKET_IP = '127.0.0.1';
export const HTTP_BATCH_IP = '127.0.0.2';
export const MESSAGE_PORT_IP = '127.0.0.3';
// Same http-batch demo compiled against Preact (react → preact/compat via
// deno.preact.jsonc) — exercises core.tsx's throw-protocol Suspense fallback.
export const PREACT_HTTP_BATCH_IP = '127.0.0.4';

export const DEFAULT_PORT = 8080;
export const WS_PORT = 8081;

export const configMap = {
  [WEBSOCKET_IP]: 'websocket-demo.html',
  [HTTP_BATCH_IP]: 'http-batch-demo.html',
  [MESSAGE_PORT_IP]: 'message-port-demo.html',
  [PREACT_HTTP_BATCH_IP]: 'http-batch-preact-demo.html',
};
