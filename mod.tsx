/**
 * Main module for react-capnweb that re-exports all transports.
 *
 * For optimal tree-shaking, import directly from specific transport modules:
 * - '@itaylor/react-capnweb/websocket'
 * - '@itaylor/react-capnweb/http-batch'
 * - '@itaylor/react-capnweb/message-port'
 * - '@itaylor/react-capnweb/custom-transport'
 *
 * This module is provided for convenience when you need multiple transports
 * or want a single import point.
 */

// Re-export core types
export type { CapnWebHooks, RpcApi } from './core.tsx';

// Re-export WebSocket transport
export {
  initCapnWebSocket,
  type WebSocketCapnWebHooks,
  type WebSocketConnectionState,
  type WebSocketOptions,
} from './websocket.tsx';

// Re-export HTTP Batch transport
export { type HttpBatchOptions, initCapnHttpBatch } from './http-batch.tsx';

// Re-export MessagePort transport
export {
  initCapnMessagePort,
  type MessagePortOptions,
} from './message-port.tsx';

// Re-export Custom Transport
export {
  type CustomTransportOptions,
  initCapnCustomTransport,
} from './custom-transport.tsx';

// Default export for backwards compatibility with existing code
export { initCapnWebSocket as default } from './websocket.tsx';
