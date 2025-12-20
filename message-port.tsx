import type { RpcCompatible, RpcSessionOptions } from 'capnweb';
import { newMessagePortRpcSession } from 'capnweb';
import { createCapnWebHooks } from './core.tsx';
import type { CapnWebHooks } from './core.tsx';

/**
 * Options for configuring MessagePort RPC behavior.
 */
export interface MessagePortOptions {
  /**
   * Local API implementation to expose to the other end for bidirectional RPC.
   * The other side of the MessagePort can call methods on this object.
   */
  localMain?: any;

  /**
   * Additional RPC session options to pass to capnweb.
   */
  sessionOptions?: RpcSessionOptions;

  /**
   * Callback invoked when the MessagePort is disconnected.
   * Note: MessagePorts are typically one-time use and cannot be reconnected.
   */
  onDisconnect?: () => void;
}

/**
 * Initialize a capnweb MessagePort RPC connection with React hooks.
 *
 * This transport communicates over MessagePorts, which is ideal for:
 * - Communication with Web Workers
 * - Communication with iframes
 * - Communication with Service Workers
 * - Any scenario requiring isolated JavaScript contexts
 *
 * Characteristics:
 * - Very efficient (minimal serialization overhead for structured cloneable types)
 * - Bidirectional (both sides can expose APIs via localMain)
 * - Same-origin by default (unless explicitly sharing ports cross-origin)
 * - No automatic reconnection (MessagePorts are one-time use)
 * - Native browser API with excellent support
 *
 * Security Note: Always create a new MessageChannel and send one port to the
 * other context. Never use Window objects directly as ports, as anyone can
 * postMessage to a window. Verify that you received the port from the expected
 * sender before initializing the RPC session.
 *
 * @example
 * ```tsx
 * // In parent component
 * import { initCapnMessagePort } from '@itaylor/react-capnweb/message-port';
 *
 * const channel = new MessageChannel();
 *
 * const { CapnWebProvider, useCapnWebApi } =
 *   initCapnMessagePort<WorkerApi>(channel.port1, {
 *     localMain: new ParentApi(), // Worker can call this
 *   });
 *
 * // Send port2 to worker
 * worker.postMessage({ port: channel.port2 }, [channel.port2]);
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
 * @example
 * ```tsx
 * // In iframe
 * import { initCapnMessagePort } from '@itaylor/react-capnweb/message-port';
 *
 * // Listen for port from parent
 * window.addEventListener('message', (event) => {
 *   if (event.data.port) {
 *     const { CapnWebProvider, useCapnWebApi } =
 *       initCapnMessagePort<ParentApi>(event.data.port);
 *
 *     // Now render your app with the provider
 *   }
 * });
 * ```
 *
 * @param port - MessagePort to communicate over
 * @param options - Configuration options for the MessagePort connection
 * @returns React hooks for interacting with the RPC API
 */
export function initCapnMessagePort<T extends RpcCompatible<T>>(
  port: MessagePort,
  options: MessagePortOptions = {},
): CapnWebHooks<T> {
  // Set up disconnect handler if provided
  if (options.onDisconnect) {
    port.addEventListener('close', options.onDisconnect);
  }

  // Create the session factory
  const sessionFactory = () => {
    const session: any = newMessagePortRpcSession<T>(
      port,
      options.localMain,
      options.sessionOptions,
    );
    return session;
  };

  // Use the shared core hooks implementation
  return createCapnWebHooks<T>(sessionFactory);
}
