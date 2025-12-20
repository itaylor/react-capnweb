import type { RpcCompatible, RpcSessionOptions } from 'capnweb';
import { newHttpBatchRpcSession } from 'capnweb';
import { createCapnWebHooks } from './core.tsx';
import type { CapnWebHooks } from './core.tsx';

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

/**
 * Initialize a capnweb HTTP Batch RPC connection with React hooks.
 *
 * This transport uses stateless HTTP requests (POST) for RPC calls. Multiple calls
 * can be automatically batched into a single HTTP request for efficiency.
 *
 * Characteristics:
 * - No persistent connection (stateless)
 * - Works through CDNs, proxies, and load balancers
 * - Good for serverless/edge deployments
 * - Lower resource usage on mobile (no persistent connection)
 * - Higher latency per call compared to WebSocket
 * - No server-initiated calls (request/response only)
 * - No automatic reconnection needed (each call is independent)
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

  // Create the session factory
  const sessionFactory = () => {
    try {
      const session: any = newHttpBatchRpcSession<T>(
        request.clone(), // Clone so each call gets a fresh request
        options.sessionOptions,
      );
      return session;
    } catch (error) {
      if (options.onError) {
        options.onError(error as Error);
      }
      throw error;
    }
  };

  // Use the shared core hooks implementation
  return createCapnWebHooks<T>(sessionFactory);
}
