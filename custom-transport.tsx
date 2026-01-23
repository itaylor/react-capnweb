import type { RpcCompatible, RpcSessionOptions, RpcTransport } from 'capnweb';
import { RpcSession } from 'capnweb';
import { createCapnWebHooksWithLifecycle } from './core.tsx';
import type { CapnWebHooks } from './core.tsx';

/**
 * Options for configuring a custom transport RPC session.
 */
export interface CustomTransportOptions {
  /**
   * Local API implementation to expose to the other end for bidirectional RPC.
   * The remote end can call methods on this object.
   */
  localMain?: any;

  /**
   * Additional RPC session options to pass to capnweb.
   */
  sessionOptions?: RpcSessionOptions;

  /**
   * Error handler called when the transport fails.
   */
  onError?: (error: Error) => void;
}

/**
 * Initialize a capnweb RPC connection with a custom transport implementation.
 *
 * This is an advanced API for users who have implemented their own RpcTransport.
 * The transport must implement the RpcTransport interface:
 *
 * ```typescript
 * interface RpcTransport {
 *   send(message: string): Promise<void>;
 *   receive(): Promise<string>;
 *   abort?(reason: any): void;
 * }
 * ```
 *
 * Use cases:
 * - Custom networking protocols
 * - Testing with mock transports
 * - Wrapping existing communication channels
 * - Adding custom middleware (logging, encryption, compression)
 *
 * Note: RPC sessions are symmetric - neither side is "client" or "server".
 * Each side can optionally expose a main interface via localMain.
 *
 * The transport connection persists across provider mount/unmount cycles.
 * Use the returned `close()` function to manually close the connection when needed.
 *
 * @example
 * ```tsx
 * import { initCapnCustomTransport } from '@itaylor/react-capnweb/custom-transport';
 *
 * class MyCustomTransport implements RpcTransport {
 *   async send(message: string): Promise<void> {
 *     // Your implementation
 *   }
 *
 *   async receive(): Promise<string> {
 *     // Your implementation
 *   }
 *
 *   abort(reason: any): void {
 *     // Your implementation
 *   }
 * }
 *
 * const { CapnWebProvider, useCapnWeb, useCapnWebApi, close } =
 *   initCapnCustomTransport<MyApi>(new MyCustomTransport(), {
 *     localMain: new MyLocalApi(),
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
 * @example
 * ```tsx
 * // Using a factory function for lazy initialization
 * const { CapnWebProvider, close } = initCapnCustomTransport<MyApi>(
 *   () => new MyCustomTransport(), // Created when first needed
 *   { localMain: new MyLocalApi() }
 * );
 * ```
 *
 * @param transport - RpcTransport instance or factory function that creates one
 * @param options - Configuration options for the RPC session
 * @returns React hooks for interacting with the RPC API, plus a close() function
 */
export function initCapnCustomTransport<T extends RpcCompatible<T>>(
  transport: RpcTransport | (() => RpcTransport),
  options: CustomTransportOptions = {},
): CapnWebHooks<T> {
  // Keep references for cleanup
  let currentTransport: RpcTransport | null = null;
  let rpcSession: any = null;

  const sessionFactory = () => {
    try {
      // Get the transport (call factory if needed)
      const actualTransport = typeof transport === 'function'
        ? transport()
        : transport;

      currentTransport = actualTransport;

      // Create the RpcSession manually with the custom transport
      rpcSession = new RpcSession(
        actualTransport,
        options.localMain,
        options.sessionOptions,
      ) as any;

      // Get the remote main stub
      const stub = rpcSession.getRemoteMain();
      return stub;
    } catch (error) {
      if (options.onError) {
        options.onError(error as Error);
      }
      throw error;
    }
  };

  const onClose = () => {
    // Abort the transport if it supports it
    if (currentTransport && typeof currentTransport.abort === 'function') {
      try {
        currentTransport.abort('Connection closed by client');
      } catch (error) {
        console.error('Error aborting custom transport:', error);
      }
    }

    // Dispose the RPC session
    if (rpcSession) {
      try {
        const disposable = rpcSession as any;
        if (typeof disposable[Symbol.dispose] === 'function') {
          disposable[Symbol.dispose]();
        }
      } catch (error) {
        console.error('Error disposing RPC session:', error);
      }
    }

    currentTransport = null;
    rpcSession = null;
  };

  return createCapnWebHooksWithLifecycle<T>(sessionFactory, onClose);
}
