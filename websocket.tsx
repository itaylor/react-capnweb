// deno-lint-ignore verbatim-module-syntax
import * as React from 'react';
import { createContext, useState } from 'react';
import type { RpcCompatible, RpcSessionOptions } from 'capnweb';
import { newWebSocketRpcSession } from 'capnweb';
import { createHooksForContext } from './core.tsx';
import type { CapnWebHooks } from './core.tsx';

/**
 * Options for configuring WebSocket RPC connection behavior.
 */
export interface WebSocketOptions {
  /**
   * Connection timeout in milliseconds. If the WebSocket doesn't open within
   * this time, it will be closed and a retry will be attempted.
   * @default 5000
   */
  timeout?: number;

  /**
   * Maximum number of reconnection attempts when the connection is lost.
   * After this many failed attempts, an error will be logged and reconnection stops.
   * @default 10
   */
  retries?: number;

  /**
   * Local API implementation to expose to the server for bidirectional RPC.
   * The server can call methods on this object.
   */
  localMain?: any;

  /**
   * Additional RPC session options to pass to capnweb.
   */
  sessionOptions?: RpcSessionOptions;
}

const defaultOptions: Required<
  Omit<WebSocketOptions, 'localMain' | 'sessionOptions'>
> = {
  timeout: 5000,
  retries: 10,
};

/**
 * Initialize a capnweb WebSocket RPC connection with React hooks.
 *
 * This transport maintains a persistent bidirectional connection, allowing:
 * - Multiple RPC calls over time without reconnecting
 * - Server-initiated calls back to the client (via localMain)
 * - Automatic reconnection with configurable retry logic
 * - Pipelining for reduced latency
 *
 * @example
 * ```tsx
 * import { initCapnWebSocket } from '@itaylor/react-capnweb/websocket';
 *
 * const { CapnWebProvider, useCapnWeb, useCapnWebApi } =
 *   initCapnWebSocket<MyApi>('ws://localhost:8080/api', {
 *     timeout: 5000,
 *     retries: 10,
 *   });
 *
 * function App() {
 *   return (
 *     <CapnWebProvider>
 *       <MyComponent />
 *     </CapnWebProvider>
 *   );
 * }
 * ```
 *
 * @param wsUrl - WebSocket URL to connect to (e.g., 'ws://localhost:8080/api')
 * @param options - Configuration options for the WebSocket connection
 * @returns React hooks for interacting with the RPC API
 */
export function initCapnWebSocket<T extends RpcCompatible<T>>(
  wsUrl: string,
  options: WebSocketOptions = {},
): CapnWebHooks<T> {
  const opts = { ...defaultOptions, ...options };
  let retryCount = 0;
  const apiContext = createContext<any | null>(null);

  function CapnWebProvider({ children }: { children: React.ReactNode }) {
    console.log('CapnWebProvider');
    const [session, setSession] = useState<any>(() => {
      return initWebsocket();
    });

    function handleClose(_event: CloseEvent) {
      // This is where the backoff logic and retry limit goes.
      if (retryCount < opts.retries) {
        retryCount++;
        const sess2 = initWebsocket();
        setSession(sess2);
      } else {
        console.error('Max websocket retries reached');
      }
    }

    function initWebsocket() {
      console.log('Starting websocket connection', wsUrl);
      const ws = new WebSocket(wsUrl);
      const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
        console.log('Websocket connection timeout hit, closing', ws);
        ws.close();
      }, opts.timeout);

      ws.addEventListener('open', () => {
        retryCount = 0;
        console.log('Websocket opened successfully');
        clearTimeout(timer);
      });

      ws.addEventListener('error', (error) => {
        console.error('Websocket error:', error);
      });

      ws.addEventListener('close', (event) => {
        console.log('Websocket closed');
        handleClose(event);
      });

      const sess = newWebSocketRpcSession(
        ws,
        options.localMain,
        options.sessionOptions,
      );
      return sess;
    }

    return <apiContext.Provider value={session}>{children}
    </apiContext.Provider>;
  }

  const hooks = createHooksForContext<T>(apiContext);

  return {
    ...hooks,
    CapnWebProvider,
  };
}
