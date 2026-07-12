import React, { useEffect } from 'react';
import type { RpcCompatible, RpcStub } from 'capnweb';

// RpcStub from capnweb supports promise pipelining where RpcPromise values can be passed as parameters
// We use 'any' in the interface to avoid type constraint issues, but RpcStub<T> in implementations

/**
 * Interface for the hooks returned by all transport initialization functions.
 * This ensures a consistent API across all transports (WebSocket, HTTP Batch, MessagePort, etc.)
 */
export interface CapnWebHooks<T extends RpcCompatible<T>> {
  /**
   * Hook for making simple RPC calls with React Suspense support.
   * Suspends until the promise resolves, making it work seamlessly with Suspense boundaries.
   *
   * @param apiName - Name of the API method to call
   * @param args - Arguments to pass to the API method
   * @returns The resolved value from the RPC call
   */
  useCapnWeb<K extends keyof T>(
    apiName: K,
    ...args: T[K] extends (...args: infer P) => any ? P : never
  ): T[K] extends (...args: any[]) => Promise<infer R> ? R : never;

  /**
   * Hook for complex RPC queries with React Suspense support.
   * Allows custom logic, multiple API calls, and promise pipelining.
   *
   * @param operationName - Unique name for this operation (used for caching)
   * @param fn - Function that takes the API and returns a Promise
   * @param deps - Dependencies that affect the query
   * @returns The resolved value from the RPC call
   */
  useCapnWebQuery<R>(
    operationName: string,
    fn: (api: RpcStub<T>) => Promise<R>,
    ...deps: any[]
  ): R;

  /**
   * Get direct access to the RPC API stub.
   * Use this for more control over when and how RPC calls are made.
   *
   * @returns The RPC API stub
   */
  getCapnWebStub: () => RpcStub<T>;

  /**
   * Manually close the connection and dispose the session.
   * After calling this, the connection will not be usable.
   * The specific behavior depends on the transport type.
   */
  close: () => void;
}

/**
 * Creates hook functions that use a provided session getter.
 *
 * @param getCapnWebStub - Function that returns the RPC session/stub
 * @returns Hook functions (useCapnWeb, useCapnWebQuery, getCapnWebStub)
 */

export function createHooks<T extends RpcCompatible<T>>(
  getCapnWebStub: () => RpcStub<T>,
): Omit<CapnWebHooks<T>, 'close'> {
  type PromiseTracker = {
    status: 'pending' | 'resolved' | 'rejected';
    promise: Promise<any>;
    timestamp: number;
    value?: unknown;
    error?: unknown;
  };

  /**
   * Suspense read that works under both renderers. React 19 exposes
   * `use(promise)`; Preact (aliased in via preact/compat) does not implement
   * it (preactjs/preact#4756), but its Suspense supports the classic
   * throw-the-promise protocol — as does React 18's. Feature-detected at call
   * time so one build of this package serves all of them, which is why the
   * tracker records `value`/`error`: the throw protocol needs a synchronous
   * read once the promise settles, where `use` keeps that state internally.
   */
  function readPromise<R>(tracker: PromiseTracker): R {
    const maybeUse = (React as { use?: <T>(p: Promise<T>) => T }).use;
    if (typeof maybeUse === 'function') {
      return maybeUse(tracker.promise) as R;
    }
    if (tracker.status === 'resolved') return tracker.value as R;
    if (tracker.status === 'rejected') throw tracker.error;
    throw tracker.promise;
  }

  const promiseCache = new Map<string, PromiseTracker>();
  const STALE_PROMISE_MS = 60000; // Clean up settled promises after 1 minute
  const CLEANUP_INTERVAL_MS = 10000; // Run cleanup every 10 seconds

  function cleanCache(cacheKey: string, deletePending: boolean = false) {
    const val = promiseCache.get(cacheKey);
    if (deletePending || val?.status !== 'pending') {
      promiseCache.delete(cacheKey);
    }
  }

  function cleanStalePromises() {
    const now = Date.now();
    for (const [key, tracker] of promiseCache.entries()) {
      if (
        tracker.status !== 'pending' &&
        now - tracker.timestamp > STALE_PROMISE_MS
      ) {
        promiseCache.delete(key);
      }
    }
  }

  // Start cleanup interval
  const _cleanupInterval = setInterval(cleanStalePromises, CLEANUP_INTERVAL_MS);

  function useNamedPromise<R>(
    currCacheKey: string,
    fn: (api: RpcStub<T>) => Promise<R>,
  ): R {
    let tracker: PromiseTracker;
    try {
      const api = getCapnWebStub() as any;
      let cached = promiseCache.get(currCacheKey);
      if (!cached) {
        const prom = Promise.resolve(fn(api));
        const promiseStatus: PromiseTracker = {
          status: 'pending',
          promise: prom,
          timestamp: Date.now(),
        };
        prom.then((value) => {
          promiseStatus.status = 'resolved';
          promiseStatus.value = value;
        });
        prom.catch((error) => {
          promiseStatus.status = 'rejected';
          promiseStatus.error = error;
        });
        promiseCache.set(currCacheKey, promiseStatus);
        cached = promiseStatus;
      }
      tracker = cached;
      useEffect(() => {
        // cleanCache(currCacheKey);
        return () => cleanCache(currCacheKey, true);
      }, [currCacheKey]);
    } catch (error) {
      // Use error message as cache key to avoid JSON.stringify issues and share cache across same errors
      const errorKey = `error:${(error as Error).name || 'Error'}: ${
        (error as Error).message || String(error)
      }`;
      const cachedError = promiseCache.get(errorKey);
      if (cachedError) {
        tracker = cachedError;
      } else {
        const prom = Promise.reject(error);
        // Mark handled: the throw-protocol read rethrows `error` without ever
        // attaching a handler to this promise.
        prom.catch(() => {});
        tracker = {
          status: 'rejected',
          promise: prom,
          timestamp: Date.now(),
          error,
        };
        promiseCache.set(errorKey, tracker);
      }
    }
    return readPromise<R>(tracker);
  }

  function useCapnWeb<K extends keyof T>(
    apiName: K,
    ...args: T[K] extends (...args: infer P) => any ? P : never
  ): T[K] extends (...args: any[]) => Promise<infer R> ? R : never {
    // Create a stable cache key from apiName and args
    const currCacheKey = JSON.stringify([apiName, ...args]);
    return useNamedPromise(currCacheKey, (api: any) => api[apiName](...args));
  }

  function useCapnWebQuery<R>(
    operationName: string,
    fn: (api: RpcStub<T>) => Promise<R>,
    ...deps: any[]
  ): R {
    // Create a stable cache key from operationName and args, the ! makes sure we don't collide with
    // names in useCapnWeb which have to be properties on the api object
    const currCacheKey = JSON.stringify(['!' + operationName, ...deps]);
    const result = useNamedPromise(
      currCacheKey,
      fn as any,
    ) as R;
    return result;
  }

  return {
    useCapnWeb,
    useCapnWebQuery,
    getCapnWebStub,
  } as Omit<CapnWebHooks<T>, 'close'>;
}

/**
 * Creates React hooks with lifecycle management for a capnweb transport.
 * This handles session creation, persistence across provider mount/unmount,
 * disposal, and a close() function.
 *
 * @param getSession - Function that returns the RPC session/stub
 * @param onClose - Optional cleanup function called when close() is invoked (before session disposal)
 * @returns The standard CapnWebHooks interface with close() function
 */
export function createCapnWebHooksWithLifecycle<T extends RpcCompatible<T>>(
  getSession: () => any,
  onClose?: () => void,
): CapnWebHooks<T> {
  function disposeSession(sess: any) {
    if (sess && typeof sess[Symbol.dispose] === 'function') {
      try {
        sess[Symbol.dispose]();
      } catch (error) {
        console.error('Error disposing session:', error);
      }
    }
  }

  function close() {
    // Call transport-specific cleanup
    if (onClose) {
      try {
        onClose();
      } catch (error) {
        console.error('Error during transport cleanup:', error);
      }
    }

    // Dispose the session (but keep the reference so getCapnWebStub doesn't return null)
    // The disposed session will handle errors naturally when methods are called
    disposeSession(getSession());
  }

  const hooks = createHooks<T>(
    getSession,
  );

  return {
    ...hooks,
    close,
  };
}
