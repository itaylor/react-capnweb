/// <reference lib="webworker" />

import { newMessagePortRpcSession, RpcTarget } from 'capnweb';

// Worker-side API implementation
class TestApiImpl extends RpcTarget {
  echo(message: string): string {
    return message;
  }

  add(a: number, b: number): number {
    return a + b;
  }
}

// Listen for the port from the main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'init' && event.data.port) {
    const port = event.data.port as MessagePort;

    try {
      // Initialize RPC session on the worker side
      newMessagePortRpcSession(port, new TestApiImpl());
      console.log('[Worker] CapnWeb RPC session initialized');

      // Notify main thread that worker is ready
      self.postMessage({ type: 'ready' });
    } catch (error) {
      console.error('[Worker] Failed to initialize RPC session:', error);
      self.postMessage({ type: 'error', error: String(error) });
    }
  }
});

// Notify that worker script has loaded
self.postMessage({ type: 'loaded' });
