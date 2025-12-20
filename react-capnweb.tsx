import type * as React from 'react';
import { createContext, use, useContext, useEffect, useState } from 'react';
import type { RpcCompatible } from 'capnweb';
import { newWebSocketRpcSession } from 'capnweb';

const webSocketOptions = {
  timeout: 5000,
  retries: 10,
};

// Opaque type to avoid deep type instantiation with RpcCompatible
export type RpcApi<T> = T & { __rpcApi: never };

export interface CapnWebSocketHooks<T> {
  CapnWebProvider: (props: { children: React.ReactNode }) => React.ReactElement;
  useCapnWeb: <TResult>(
    fn: (api: RpcApi<T>) => Promise<TResult>,
    deps?: any[],
  ) => TResult | undefined;
  useCapnWebApi: () => RpcApi<T>;
}

export function initCapnWebSocket<T extends RpcCompatible<T>>(
  wsUrl: string,
  options: {
    timeout: number;
    retries: number;
  } = webSocketOptions,
): CapnWebSocketHooks<T> {
  let retryCount = 0;
  const apiContext = createContext<any | null>(null);

  function CapnWebProvider({ children }: { children: React.ReactNode }) {
    console.log('CapnWebProvider');
    const [session, setSession] = useState<any>(() => {
      return initWebsocket();
    });
    function handleClose(_event: CloseEvent) {
      // This is where the backoff logic and retry limit goes.
      if (retryCount < options.retries) {
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
      }, options.timeout);
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
      const sess = newWebSocketRpcSession(ws);
      return sess;
    }
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
