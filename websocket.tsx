// deno-lint-ignore verbatim-module-syntax
import * as React from 'react';
import { useEffect, useState } from 'react';
import type { RpcCompatible, RpcSessionOptions, RpcStub } from 'capnweb';
import { newWebSocketRpcSession } from 'capnweb';
import { createCapnWebHooksWithLifecycle } from './core.tsx';
import type { CapnWebHooks } from './core.tsx';

/**
 * WebSocket connection state.
 */
export type WebSocketConnectionState =
  | { status: 'connecting'; attempt: number }
  | { status: 'connected' }
  | { status: 'reconnecting'; attempt: number; nextRetryMs?: number }
  | { status: 'disconnected'; reason?: string }
  | { status: 'closed' };

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
   * Function to calculate the delay before a reconnection attempt.
   * Receives the current retry count (1-indexed) and returns delay in milliseconds.
   *
   * @default Exponential backoff with jitter: min(1000 * 2^(retryCount-1), 30000) + random(0-1000)
   *
   * @example
   * ```typescript
   * // Custom fixed delay of 5 seconds
   * backoffStrategy: () => 5000
   *
   * // Linear backoff
   * backoffStrategy: (retryCount) => retryCount * 2000
   *
   * // Custom exponential without jitter
   * backoffStrategy: (retryCount) => Math.min(1000 * Math.pow(2, retryCount - 1), 60000)
   * ```
   */
  backoffStrategy?: (retryCount: number) => number;

  /**
   * Local API implementation to expose to the server for bidirectional RPC.
   * The server can call methods on this object.
   */
  localMain?: any;

  /**
   * Additional RPC session options to pass to capnweb.
   */
  sessionOptions?: RpcSessionOptions;

  /**
   * Callback invoked when the WebSocket connection is successfully established.
   */
  onConnected?: () => void;

  /**
   * Callback invoked when the WebSocket connection is lost.
   * @param reason - Optional reason for disconnection
   */
  onDisconnected?: (reason?: string) => void;

  /**
   * Callback invoked when a reconnection attempt is starting.
   * @param attempt - The current retry attempt number (1-indexed)
   */
  onReconnecting?: (attempt: number) => void;

  /**
   * Callback invoked when all reconnection attempts have been exhausted.
   */
  onReconnectFailed?: () => void;
}

/**
 * Extended hooks interface that includes WebSocket-specific methods.
 */
export interface WebSocketCapnWebHooks<T extends RpcCompatible<T>>
  extends CapnWebHooks<T> {
  /**
   * Hook to access the current WebSocket connection state.
   * Returns state object with status and additional information.
   */
  useConnectionState: () => WebSocketConnectionState;
}

/**
 * Default exponential backoff strategy with jitter.
 * Base delay: 1s, doubles each retry (1s, 2s, 4s, 8s, 16s, 30s max)
 * Adds random jitter of 0-1000ms to prevent thundering herd problem.
 */
function defaultBackoffStrategy(retryCount: number): number {
  const baseDelay = Math.min(1000 * Math.pow(2, retryCount - 1), 30000);
  const jitter = Math.random() * 1000;
  return baseDelay + jitter;
}

const defaultOptions: Required<
  Omit<
    WebSocketOptions,
    | 'localMain'
    | 'sessionOptions'
    | 'onConnected'
    | 'onDisconnected'
    | 'onReconnecting'
    | 'onReconnectFailed'
  >
> = {
  timeout: 5000,
  retries: 10,
  backoffStrategy: defaultBackoffStrategy,
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
 * The WebSocket connection persists across provider mount/unmount cycles,
 * making it suitable for app-level connections that should survive navigation.
 * Use the returned `close()` function to manually close the connection when needed.
 *
 * @example
 * ```tsx
 * import { initCapnWebSocket } from '@itaylor/react-capnweb/websocket';
 *
 * const { CapnWebProvider, useCapnWeb, useCapnWebApi, close } =
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
 *
 * // Later, to close the connection:
 * close();
 * ```
 *
 * @param wsUrl - WebSocket URL to connect to (e.g., 'ws://localhost:8080/api')
 * @param options - Configuration options for the WebSocket connection
 * @returns React hooks for interacting with the RPC API, plus a close() function
 */
export function initCapnWebSocket<T extends RpcCompatible<T>>(
  wsUrl: string,
  options: WebSocketOptions = {},
): WebSocketCapnWebHooks<T> {
  const opts = { ...defaultOptions, ...options };

  // Connection state lives in closure, persists across provider mount/unmount
  let currentWs: WebSocket | null = null;
  let retryCount = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  let isReconnecting = false;
  let connectionState: WebSocketConnectionState = {
    status: 'connecting',
    attempt: 0,
  };
  const stateListeners = new Set<(state: WebSocketConnectionState) => void>();
  let session = initWebsocket();

  function disposeSession(sess: any) {
    if (sess && typeof sess[Symbol.dispose] === 'function') {
      try {
        sess[Symbol.dispose]();
      } catch (error) {
        console.error('Error disposing WebSocket session:', error);
      }
    }
  }

  function setConnectionState(newState: WebSocketConnectionState) {
    connectionState = newState;
    stateListeners.forEach((listener) => listener(connectionState));
  }

  function handleClose(_event: CloseEvent) {
    if (connectionState.status === 'closed') {
      return;
    }

    // Clear connection timeout if it exists
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }

    // Prevent concurrent reconnection attempts
    if (isReconnecting) {
      return;
    }

    // Update state and notify
    setConnectionState({ status: 'disconnected' });
    if (options.onDisconnected) {
      options.onDisconnected();
    }

    // Check if we should retry
    if (retryCount < opts.retries) {
      isReconnecting = true;
      retryCount++;

      // Calculate delay using backoff strategy
      const delay = opts.backoffStrategy(retryCount);

      console.log(
        `WebSocket closed. Reconnecting in ${
          Math.round(delay)
        }ms (attempt ${retryCount}/${opts.retries})`,
      );

      setConnectionState({
        status: 'reconnecting',
        attempt: retryCount,
        nextRetryMs: delay,
      });

      if (options.onReconnecting) {
        options.onReconnecting(retryCount);
      }

      reconnectTimeout = setTimeout(() => {
        isReconnecting = false;
        reconnectTimeout = null;
        // Dispose old session before creating new one
        disposeSession(session);
        session = initWebsocket();
      }, delay);
    } else {
      console.error(
        `Max WebSocket retries (${opts.retries}) reached. Connection failed.`,
      );
      setConnectionState({
        status: 'disconnected',
        reason: 'Max retries reached',
      });
      if (options.onReconnectFailed) {
        options.onReconnectFailed();
      }
    }
  }

  function initWebsocket() {
    console.log('Starting WebSocket connection to', wsUrl);
    const ws = new WebSocket(wsUrl);
    currentWs = ws;

    // Update state to connecting
    setConnectionState({
      status: 'connecting',
      attempt: retryCount || 0,
    });

    // Set connection timeout
    connectionTimeout = setTimeout(() => {
      console.log(
        `WebSocket connection timeout (${opts.timeout}ms) reached, closing`,
      );
      ws.close();
      connectionTimeout = null;
    }, opts.timeout);

    ws.addEventListener('open', () => {
      // Connection successful, reset retry count
      retryCount = 0;
      console.log('WebSocket connection opened successfully');

      // Clear connection timeout
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }

      // Update state and notify
      setConnectionState({ status: 'connected' });
      if (options.onConnected) {
        options.onConnected();
      }
    });

    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);

      // Clear connection timeout on error
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
    });

    ws.addEventListener('close', (event) => {
      console.log('WebSocket closed');
      handleClose(event);
    });

    const sess = newWebSocketRpcSession(
      ws,
      options.localMain,
      options.sessionOptions,
    );
    console.log('Created new Websocket Session...');
    return sess;
  }

  function close() {
    // Clear any pending reconnection timeout
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    // Clear any pending connection timeout
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }

    // Close the WebSocket
    if (currentWs) {
      currentWs.close();
      currentWs = null;
    }

    // Dispose the session (but keep the reference so useCapnWebApi doesn't return null)
    // The disposed session will handle errors naturally when methods are called
    disposeSession(session);

    // Update state
    setConnectionState({ status: 'closed' });
  }

  function useConnectionState(): WebSocketConnectionState {
    const [state, setState] = useState<WebSocketConnectionState>(
      connectionState,
    );

    useEffect(() => {
      // Register listener for state updates
      const listener = (newState: WebSocketConnectionState) => {
        setState(newState);
      };
      stateListeners.add(listener);

      // Set initial state in case it changed before mount
      setState(connectionState);

      return () => {
        stateListeners.delete(listener);
      };
    }, []);

    return state;
  }

  function useCapnWebStub(): RpcStub<T> {
    return session as any;
  }

  const hooks = createCapnWebHooksWithLifecycle<T>(useCapnWebStub, close);

  return {
    ...hooks,
    useConnectionState,
  };
}
