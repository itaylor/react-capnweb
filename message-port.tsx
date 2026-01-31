import type { RpcCompatible, RpcSessionOptions } from 'capnweb';
import { newMessagePortRpcSession } from 'capnweb';
import { createCapnWebHooksWithLifecycle } from './core.tsx';
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
   * Note: The 'close' event has limited browser support. Test in your target environments.
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
 * The MessagePort connection persists across provider mount/unmount cycles.
 * Use the returned `close()` function to manually close the connection when needed.
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
 * const { getCapnWebStub, close } =
 *   initCapnMessagePort<WorkerApi>(channel.port1, {
 *     localMain: new ParentApi(), // Worker can call this
 *   });
 *
 * // Send port2 to worker
 * worker.postMessage({ port: channel.port2 }, [channel.port2]);
 *
 * function App() {
 *   return <MyComponent />;
 * }
 *
 * // Later, to close the connection:
 * close();
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
 *     const { getCapnWebStub } =
 *       initCapnMessagePort<ParentApi>(event.data.port);
 *
 *     // Now render your app
 *   }
 * });
 * ```
 *
 * @param port - MessagePort to communicate over
 * @param options - Configuration options for the MessagePort connection
 * @returns React hooks for interacting with the RPC API, plus a close() function
 */
export function initCapnMessagePort<T extends RpcCompatible<T>>(
  port: MessagePort,
  options: MessagePortOptions = {},
): CapnWebHooks<T> {
  // Set up disconnect handler if provided
  // Note: 'close' event has limited browser support - see documentation
  if (options.onDisconnect) {
    port.addEventListener('close', options.onDisconnect);
  }

  const session: any = newMessagePortRpcSession<T>(
    port,
    options.localMain,
    options.sessionOptions,
  );

  const sessionFactory = () => session;

  const onClose = () => {
    // Close the MessagePort
    try {
      port.close();
    } catch (error) {
      console.error('Error closing MessagePort:', error);
    }
  };

  return createCapnWebHooksWithLifecycle<T>(sessionFactory, onClose);
}
