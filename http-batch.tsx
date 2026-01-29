import type { RpcCompatible, RpcSessionOptions, RpcStub } from 'capnweb';
import { newHttpBatchRpcSession } from 'capnweb';
import type { CapnWebHooks } from './core.tsx';
import { createHooksForContext } from './core.tsx';
import { createContext } from 'react';
/**
 * Options for configuring HTTP Batch RPC behavior.
 */
export interface HttpBatchOptions {
  /**
   * Custom headers to include with each request.
   */
  headers?: Record<string, string>;

  /**
   * Credentials mode for fetch requests.
   * @default 'same-origin'
   */
  credentials?: RequestCredentials;

  /**
   * Request mode for fetch requests.
   * @default 'cors'
   */
  mode?: RequestMode;

  /**
   * Cache mode for fetch requests.
   * @default 'no-cache'
   */
  cache?: RequestCache;

  /**
   * Redirect mode for fetch requests.
   * @default 'follow'
   */
  redirect?: RequestRedirect;

  /**
   * Referrer policy for fetch requests.
   */
  referrerPolicy?: ReferrerPolicy;

  /**
   * Additional RPC session options to pass to capnweb.
   */
  sessionOptions?: RpcSessionOptions;

  /**
   * Error handler called when an HTTP request fails.
   */
  onError?: (error: Error) => void;
}

// RpcStub from capnweb supports promise pipelining where RpcPromise values can be passed as parameters
/**
 * Initialize a capnweb HTTP Batch RPC connection with React hooks.
 *
 * This transport uses stateless HTTP requests (POST) for RPC calls. Multiple calls
 * made within a single `useCapnWeb` call (before any await) are automatically batched
 * into a single HTTP request.
 *
 * **Important: HTTP Batch sessions are single-use.** Each call to `useCapnWeb()` or
 * `useCapnWebApi()` creates a new batch session. After you await any call, you must call
 * `useCapnWebApi()` again to get a fresh session for the next batch.
 *
 * **Note:** `useCapnWebApi()` is not actually a React hook - it doesn't use context or state,
 * it simply creates a new session. This means you can call it anywhere, including inside
 * async functions and event handlers (unlike normal React hooks).
 *
 * Characteristics:
 * - No persistent connection (stateless)
 * - Works through CDNs, proxies, and load balancers
 * - Good for serverless/edge deployments
 * - Lower resource usage on mobile (no persistent connection)
 * - Higher latency per batch compared to WebSocket
 * - No server-initiated calls (request/response only)
 * - Supports promise pipelining within a batch
 *
 * @example
 * ```tsx
 * import { initCapnHttpBatch } from '@itaylor/react-capnweb/http-batch';
 *
 * const { CapnWebProvider, useCapnWeb, useCapnWebApi } =
 *   initCapnHttpBatch<MyApi>('/api/rpc', {
 *     headers: { 'Authorization': 'Bearer token123' },
 *     credentials: 'include',
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
 * function MyComponent() {
 *   // All calls within this function are batched into a single HTTP request
 *   const [user, posts, comments] = useCapnWeb((api) => {
 *     const userPromise = api.getUser('123');
 *     const postsPromise = api.getUserPosts('123');
 *     const commentsPromise = api.getUserComments('123');
 *     return Promise.all([userPromise, postsPromise, commentsPromise]);
 *   }, ['123']);
 *
 *   // Or use the API directly (creates a new batch per call after await)
 *   const api = useCapnWebApi();
 *   const handleAction = async () => {
 *     const result1 = await api.doSomething(); // Batch 1
 *     const result2 = await api.doSomethingElse(); // Batch 2 (new session)
 * };
 * }
 * ```
 *
 * **Batching examples:**
 *
 * ```tsx
 * // ✅ Single batch - all calls in one HTTP request
 * const results = useCapnWeb((api) => {
 *   const r1 = api.call1();
 *   const r2 = api.call2();
 *   return Promise.all([r1, r2]);
 * });
 *
 * // ✅ Single batch with promise pipelining
 * const result = useCapnWeb((api) => {
 *   const userId = api.lookupUser('alice');
 *   return api.getUserData(userId); // userId resolved on server
 * });
 *
 * // ✅ Multiple batches - each await creates a new batch/HTTP request
 * const api = useCapnWebApi();
 * const r1 = await api.call1(); // HTTP request 1
 * const r2 = await api.call2(); // HTTP request 2
 *
 * // ✅ Multiple batches using useCapnWeb
 * const r1 = useCapnWeb((api) => api.call1()); // HTTP request 1
 * const r2 = useCapnWeb((api) => api.call2()); // HTTP request 2
 *
 * // ❌ Won't work - awaiting inside useCapnWeb ends the batch
 * const result = useCapnWeb(async (api) => {
 *   const r1 = await api.call1(); // Batch ends here
 *   const r2 = await api.call2(); // Session already closed!
 *   return [r1, r2];
 * });
 * ```
 *
 * @param url - URL endpoint for the RPC API (e.g., '/api/rpc' or 'https://api.example.com/rpc')
 * @param options - Configuration options for HTTP requests
 * @returns React hooks for interacting with the RPC API
 */
export function initCapnHttpBatch<T extends RpcCompatible<T>>(
  url: string,
  options: HttpBatchOptions = {},
): CapnWebHooks<T> {
  // Build a Request object with all the options
  const request = new Request(url, {
    method: 'POST',
    headers: options.headers,
    credentials: options.credentials ?? 'same-origin',
    mode: options.mode ?? 'cors',
    cache: options.cache ?? 'no-cache',
    redirect: options.redirect ?? 'follow',
    referrerPolicy: options.referrerPolicy,
  });

  // Create a dummy context (not used, but required by createHooksForContext)
  const apiContext = createContext<any | null>(null);

  // Custom useCapnWebStub that creates a new HTTP batch session each time
  function useCapnWebStub(): RpcStub<T> {
    const session = newHttpBatchRpcSession<T>(
      request.clone(),
      options.sessionOptions,
    ) as any;
    return session as RpcStub<T>;
  }

  // Use the core hooks with our custom stub implementation
  const hooks = createHooksForContext<T>(apiContext, useCapnWebStub);

  function CapnWebProvider({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }

  function close() {
    // No-op for HTTP Batch - no persistent connection to close
  }

  return {
    ...hooks,
    CapnWebProvider,
    close,
  };
}
