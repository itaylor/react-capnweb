import * as React from 'react';
import { createContext, use, useContext, useEffect, useState } from 'react';
import type { RpcCompatible } from 'capnweb';

// Opaque type to avoid deep type instantiation with RpcCompatible
// TODO: Can potentially be replaced with RpcStub<T> once we resolve type constraints
export type RpcApi<T> = T & { __rpcApi: never };

/**
 * Interface for the hooks returned by all transport initialization functions.
 * This ensures a consistent API across all transports (WebSocket, HTTP Batch, MessagePort, etc.)
 */
export interface CapnWebHooks<T> {
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
    fn: (api: RpcApi<T>) => Promise<TResult>,
    deps?: any[],
  ) => TResult | undefined;

  /**
   * Hook for direct access to the RPC API.
   * Use this for more control over when and how RPC calls are made.
   *
   * @returns The RPC API stub
   */
  useCapnWebApi: () => RpcApi<T>;
}

/**
 * Creates the standard set of React hooks for a capnweb transport.
 * This is used internally by all transport-specific initialization functions.
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

  function useCapnWeb<TResult>(
    fn: (api: RpcApi<T>) => Promise<TResult>,
    deps: any[] = [],
  ): TResult | undefined {
    const api = useCapnWebApi();
    const [prom, setProm] = useState<Promise<TResult> | null>(null);
    useEffect(() => {
      setProm(fn(api));
    }, [api, ...deps]);
    if (prom) {
      return use(prom);
    }
    return undefined;
  }

  function useCapnWebApi(): RpcApi<T> {
    const api = useContext(apiContext);
    if (!api) {
      throw new Error('useCapnWebApi must be used within a CapnWebProvider');
    }

    return api as RpcApi<T>;
  }

  return {
    useCapnWeb,
    useCapnWebApi,
    CapnWebProvider,
  };
}
