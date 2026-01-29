// deno-lint-ignore verbatim-module-syntax
import * as React from 'react';
import { createContext, use, useContext, useEffect, useState } from 'react';
import type { RpcCompatible, RpcStub } from 'capnweb';

// RpcStub from capnweb supports promise pipelining where RpcPromise values can be passed as parameters
// We use 'any' in the interface to avoid type constraint issues, but RpcStub<T> in implementations

/**
 * Interface for the hooks returned by all transport initialization functions.
 * This ensures a consistent API across all transports (WebSocket, HTTP Batch, MessagePort, etc.)
 */
export interface CapnWebHooks<T extends RpcCompatible<T>> {
  /**
   * Provider component that manages the RPC session lifecycle.
   * Wrap your application or component tree with this provider.
   */
  CapnWebProvider: (props: {
    children: React.ReactNode;
  }) => React.ReactElement;

  /**
   * Hook for making RPC calls with React Suspense support.
   * Suspends until the promise resolves, making it work seamlessly with Suspense boundaries.
   *
   * @param fn - Function that takes the API and returns a Promise
   * @param deps - Dependency array (like useEffect)
   * @returns The resolved value from the RPC call
   */
  useCapnWeb: <TResult>(
    fn: (api: RpcStub<T>) => Promise<TResult>,
    deps?: any[],
  ) => TResult | undefined;

  useCapnWeb2<K extends keyof T>(
    apiName: K,
    ...args: T[K] extends (...args: infer P) => any ? P : never
  ): T[K] extends (...args: any[]) => Promise<infer R> ? R : never;

  useCapnWeb3<R>(
    operationName: string,
    fn: (api: RpcStub<T>) => Promise<R>,
    ...deps: any[]
  ): R;

  /**
   * Hook for direct access to the RPC API.
   * Use this for more control over when and how RPC calls are made.
   *
   * @returns The RPC API stub
   */
  useCapnWebApi: () => RpcStub<T>;

  /**
   * Manually close the connection and dispose the session.
   * After calling this, the connection will not be usable.
   * The specific behavior depends on the transport type.
   */
  close: () => void;
}

/**
 * Creates hook functions that work with a provided context.
 * This is used when you need custom provider logic (like reconnection in WebSocket).
 *
 * @param apiContext - React context that holds the RPC session/stub
 * @returns Hook functions (useCapnWeb and useCapnWebApi)
 */

export function createHooksForContext<T extends RpcCompatible<T>>(
  apiContext: React.Context<any>,
): Omit<CapnWebHooks<T>, 'CapnWebProvider' | 'close'> {
  /**
   * Hook for making RPC calls with React Suspense support.
   *
   * The function will suspend while the RPC call is in progress, making it work
   * seamlessly with Suspense boundaries.
   *
   * @param fn - Function that takes the API and returns a Promise
   * @param deps - Dependency array (like useEffect)
   * @returns The resolved value from the RPC call, or undefined on first render
   *
   * **Important Notes:**
   *
   * - **Suspense**: The component suspends immediately on first render while the RPC call
   *   is in progress. Make sure to wrap in a Suspense boundary to show a loading state.
   *
   * - **Concurrent calls**: If dependencies change while a call is in progress, the old call
   *   continues to run but a new call is initiated. The old call's result will be ignored.
   *   This is generally fine for multiplexed transports (WebSocket, MessagePort) and stateless
   *   HTTP requests, but be aware that network resources are used.
   *
   * - **Error handling**: Use an Error Boundary to catch errors from failed RPC calls.
   *
   * @example
   * ```tsx
   * function UserProfile({ userId }) {
   *   const user = useCapnWeb(
   *     (api) => api.getUser(userId),
   *     [userId]
   *   );
   *
   *   return <div>{user?.name}</div>;
   * }
   *
   * // Wrap with Suspense and Error Boundary
   * function App() {
   *   return (
   *     <ErrorBoundary fallback={<Error />}>
   *       <Suspense fallback={<Loading />}>
   *         <UserProfile userId="123" />
   *       </Suspense>
   *     </ErrorBoundary>
   *   );
   * }
   * ```
   */
  function useCapnWeb<TResult>(
    fn: (api: RpcStub<T>) => Promise<TResult>,
    deps: any[] = [],
  ): TResult | undefined {
    const api = useCapnWebApi() as any;
    const [prom, setProm] = useState<Promise<TResult> | null>(null);
    useEffect(() => {
      setProm(Promise.resolve(fn(api)));
    }, [api, ...deps]);
    if (prom) {
      return use(prom);
    }
  }

  type PromiseTracker = {
    status: 'pending' | 'resolved' | 'rejected';
    promise: Promise<any>;
  };

  const promiseCache = new Map<string, PromiseTracker>();
  function cleanCache(cacheKey: string, deletePending: boolean = false) {
    const val = promiseCache.get(cacheKey);
    if (deletePending || val?.status !== 'pending') {
      promiseCache.delete(cacheKey);
    }
  }

  function useNamedPromise<R>(
    currCacheKey: string,
    fn: (api: RpcStub<T>) => Promise<R>,
  ): R {
    const api = useCapnWebApi() as any;
    let prom = promiseCache.get(currCacheKey)?.promise;
    if (!prom) {
      prom = Promise.resolve(fn(api));
      const promiseStatus: PromiseTracker = {
        status: 'pending',
        promise: prom,
      };
      prom.then(() => {
        promiseStatus.status = 'resolved';
      });
      prom.catch(() => {
        promiseStatus.status = 'rejected';
      });
      promiseCache.set(currCacheKey, promiseStatus);
    }
    useEffect(() => {
      cleanCache(currCacheKey);
      return () => cleanCache(currCacheKey, true);
    }, [currCacheKey]);
    return use(prom);
  }

  function useCapnWeb2<K extends keyof T>(
    apiName: K,
    ...args: T[K] extends (...args: infer P) => any ? P : never
  ): T[K] extends (...args: any[]) => Promise<infer R> ? R : never {
    // Create a stable cache key from apiName and args
    const currCacheKey = JSON.stringify([apiName, ...args]);
    return useNamedPromise(currCacheKey, (api: any) => api[apiName](...args));
  }

  function useCapnWeb3<R>(
    operationName: string,
    fn: (api: RpcStub<T>) => Promise<R>,
    ...deps: any[]
  ): R {
    // Create a stable cache key from operationName and args, the ! makes sure we don't collide with
    // names in useCapnWeb2 which have to be properties on the api object
    const currCacheKey = JSON.stringify(['!' + operationName, ...deps]);
    const result = useNamedPromise(
      currCacheKey,
      fn as any,
    ) as R;
    return result;
  }

  function useCapnWebApi(): RpcStub<T> {
    const api = useContext(apiContext);
    if (!api) {
      throw new Error('useCapnWebApi must be used within a CapnWebProvider');
    }

    return api as RpcStub<T>;
  }

  return {
    useCapnWeb,
    useCapnWeb2,
    useCapnWeb3,
    useCapnWebApi,
  } as Omit<CapnWebHooks<T>, 'CapnWebProvider' | 'close'>;
}

/**
 * Creates the standard set of React hooks for a capnweb transport.
 * This is used internally by transport-specific initialization functions
 * that don't need custom provider logic.
 *
 * @param sessionFactory - Function that creates and returns the RPC session/stub
 * @returns The standard CapnWebHooks interface
 */
export function createCapnWebHooks<T extends RpcCompatible<T>>(
  sessionFactory: () => any,
): CapnWebHooks<T> {
  const apiContext = createContext<any | null>(null);

  function CapnWebProvider({ children }: { children: React.ReactNode }) {
    const [session] = useState<any>(sessionFactory);

    return <apiContext.Provider value={session}>{children}
    </apiContext.Provider>;
  }

  const hooks = createHooksForContext<T>(apiContext);

  return {
    ...hooks,
    CapnWebProvider,
    close: () => {}, // No-op close for backward compatibility
  };
}

/**
 * Creates React hooks with lifecycle management for a capnweb transport.
 * This handles session creation, persistence across provider mount/unmount,
 * disposal, and a close() function.
 *
 * @param sessionFactory - Function that creates and returns the RPC session/stub
 * @param onClose - Optional cleanup function called when close() is invoked (before session disposal)
 * @returns The standard CapnWebHooks interface with close() function
 */
export function createCapnWebHooksWithLifecycle<T extends RpcCompatible<T>>(
  sessionFactory: () => any,
  onClose?: () => void,
): CapnWebHooks<T> {
  const apiContext = createContext<any | null>(null);

  // Connection state lives in closure, persists across provider mount/unmount
  let session: any | null = null;
  let isClosed = false;
  const listeners = new Set<(session: any) => void>();

  function disposeSession(sess: any) {
    if (sess && typeof sess[Symbol.dispose] === 'function') {
      try {
        sess[Symbol.dispose]();
      } catch (error) {
        console.error('Error disposing session:', error);
      }
    }
  }

  function notifyListeners() {
    listeners.forEach((listener) => listener(session));
  }

  function initSession() {
    if (isClosed) {
      throw new Error('Cannot initialize session after it has been closed');
    }

    return sessionFactory();
  }

  function close() {
    if (isClosed) {
      return; // Already closed
    }

    isClosed = true;

    // Call transport-specific cleanup
    if (onClose) {
      try {
        onClose();
      } catch (error) {
        console.error('Error during transport cleanup:', error);
      }
    }

    // Dispose the session (but keep the reference so useCapnWebApi doesn't return null)
    // The disposed session will handle errors naturally when methods are called
    disposeSession(session);
    notifyListeners();
  }

  function CapnWebProvider({ children }: { children: React.ReactNode }) {
    const [currentSession, setCurrentSession] = useState<any | null>(
      () => {
        // Initialize session on first mount if not already initialized
        if (!session && !isClosed) {
          session = initSession();
        }
        return session;
      },
    );

    useEffect(() => {
      // Register listener for session updates
      const listener = (newSession: any) => {
        setCurrentSession(newSession);
      };
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    }, []);

    return (
      <apiContext.Provider value={currentSession}>
        {children}
      </apiContext.Provider>
    );
  }

  const hooks = createHooksForContext<T>(apiContext);

  return {
    ...hooks,
    CapnWebProvider,
    close,
  };
}
