/// <reference lib="dom" />
import React, { Component, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initCapnMessagePort } from '../message-port.tsx';
import type { RpcTarget } from 'capnweb';

// Mock API interface for testing
interface TestApi extends RpcTarget {
  echo(message: string): string;
  add(a: number, b: number): number;
}

// Create worker and MessageChannel
let worker: Worker | null = null;
let channel: MessageChannel | null = null;
let capnWebHooks: ReturnType<typeof initCapnMessagePort<TestApi>> | null = null;

function initializeWorker(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Create the worker
      worker = new Worker(
        new URL('./message-port-worker.js', import.meta.url),
        { type: 'module' },
      );

      // Create MessageChannel
      channel = new MessageChannel();

      // Initialize CapnWeb with port1
      capnWebHooks = initCapnMessagePort<TestApi>(channel.port1, {
        onDisconnect: () => {
          console.log('[MessagePort] Disconnected');
        },
      });

      // Listen for worker ready message
      const messageHandler = (event: MessageEvent) => {
        if (event.data.type === 'ready') {
          console.log('[Main] Worker is ready');
          worker?.removeEventListener('message', messageHandler);
          resolve();
        } else if (event.data.type === 'error') {
          console.error('[Main] Worker error:', event.data.error);
          worker?.removeEventListener('message', messageHandler);
          reject(new Error(event.data.error));
        }
      };

      worker.addEventListener('message', messageHandler);

      // Send port2 to the worker
      worker.postMessage({ type: 'init', port: channel.port2 }, [
        channel.port2,
      ]);

      // Timeout after 5 seconds
      setTimeout(() => {
        worker?.removeEventListener('message', messageHandler);
        reject(new Error('Worker initialization timeout'));
      }, 5000);
    } catch (error) {
      reject(error);
    }
  });
}

// Error Boundary to catch errors from disposed sessions
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: any) {
    console.log('ErrorBoundary caught error:', error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className='test-result test-error'>
          Error: {this.state.error?.message || 'Unknown error'}
        </div>
      );
    }

    return this.props.children;
  }
}

function PortStatus() {
  const [status, setStatus] = useState<'initializing' | 'ready' | 'closed'>(
    'initializing',
  );

  useEffect(() => {
    if (capnWebHooks) {
      setStatus('ready');
    }
  }, []);

  return (
    <div className='test-section'>
      <h2>MessagePort Status</h2>
      <div className='info-box'>
        ℹ️ MessagePort provides efficient communication between contexts (main
        thread and Web Workers). This demo uses a real Web Worker.
      </div>
      <div
        className={`test-result ${
          status === 'ready'
            ? 'test-success'
            : status === 'initializing'
            ? ''
            : 'test-error'
        }`}
        data-testid='port-status'
        data-status={status}
      >
        {status === 'initializing'
          ? '⏳ Initializing Worker...'
          : status === 'ready'
          ? '✓ Worker Ready'
          : '✗ Port Closed'}
      </div>
    </div>
  );
}

function ApiTests() {
  const api = capnWebHooks!.getCapnWebStub();
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addResult = (message: string) => {
    setTestResults((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const runTests = async () => {
    setIsRunning(true);
    setTestResults([]);

    try {
      // Test 1: Echo
      addResult('Testing echo...');
      const echoResult = await api.echo('Hello MessagePort');
      if (echoResult === 'Hello MessagePort') {
        addResult('✓ Echo test passed');
      } else {
        addResult(
          `✗ Echo test failed: expected "Hello MessagePort", got "${echoResult}"`,
        );
      }

      // Test 2: Add numbers
      addResult('Testing add...');
      const sum = await api.add(7, 3);
      if (sum === 10) {
        addResult('✓ Add test passed: 7 + 3 = 10');
      } else {
        addResult(`✗ Add test failed: expected 10, got ${sum}`);
      }

      // Test 3: Multiple sequential calls
      addResult('Testing sequential calls...');
      const r1 = await api.add(1, 1);
      const r2 = await api.add(2, 2);
      const r3 = await api.add(3, 3);
      if (r1 === 2 && r2 === 4 && r3 === 6) {
        addResult('✓ Sequential calls test passed');
      } else {
        addResult(`✗ Sequential calls test failed: [${r1}, ${r2}, ${r3}]`);
      }

      // Test 4: Concurrent calls
      addResult('Testing concurrent calls...');
      const [c1, c2, c3] = await Promise.all([
        api.add(10, 5),
        api.add(20, 10),
        api.add(30, 15),
      ]);
      if (c1 === 15 && c2 === 30 && c3 === 45) {
        addResult('✓ Concurrent calls test passed');
      } else {
        addResult(`✗ Concurrent calls test failed: [${c1}, ${c2}, ${c3}]`);
      }

      addResult('All tests completed!');
    } catch (error) {
      addResult(
        `✗ Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className='test-section'>
      <h2>RPC API Tests</h2>
      <button
        type='button'
        className='action-button'
        onClick={runTests}
        disabled={isRunning}
        data-testid='run-api-tests-btn'
      >
        {isRunning ? 'Running Tests...' : 'Run API Tests'}
      </button>
      {testResults.length > 0 && (
        <div className='message-list' data-testid='test-results'>
          {testResults.map((result, i) => (
            <div key={i} className='message-item'>
              {result}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UseCapnWebTests() {
  // Simple demonstration of useCapnWeb's API.
  const [count, setCount] = useState(1);
  const result = capnWebHooks!.useCapnWeb('add', 5, count);

  return (
    <div className='test-section'>
      <h2>useCapnWeb Demo</h2>
      <div className='info-box'>
        ℹ️ useCapnWeb allows simple method calls with automatic caching and
        Suspense support
      </div>
      <div
        className='message-list'
        data-testid='usecapnweb-test-results'
        style={{ marginTop: '12px' }}
      >
        <div className='message-item'>
          {new Date().toLocaleTimeString()}: 5 + {count} = {result}
        </div>
        <div className='message-item'>
          {result === count + 5 ? '✓ Success!' : '✗ Failed'}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            type='button'
            className='action-button'
            onClick={() => {
              setCount((_count) => _count + 1);
            }}
          >
            Increment
          </button>
          <button
            type='button'
            className='action-button'
            onClick={() => {
              setCount((_count) => _count - 1);
            }}
          >
            Decrement
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualPortControl() {
  const [closed, setClosed] = useState(false);

  const handleClose = () => {
    capnWebHooks!.close();
    setClosed(true);
  };

  return (
    <div className='test-section'>
      <h2>Manual Port Control</h2>
      <div className='info-box'>
        ℹ️ Closing the MessagePort will terminate communication. MessagePorts
        are typically one-time use.
      </div>
      <button
        type='button'
        className='action-button'
        onClick={handleClose}
        disabled={closed}
        data-testid='close-port-btn'
      >
        Close Port
      </button>
      {closed && (
        <div
          className='test-result test-success'
          data-testid='close-confirmation'
        >
          Port closed. Further RPC calls will fail.
        </div>
      )}
    </div>
  );
}

function DirectApiUsage() {
  const api = capnWebHooks!.getCapnWebStub();
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleDirectCall = async () => {
    setLoading(true);
    try {
      const response = await api.echo('Direct MessagePort call');
      setResult(`Success: ${response}`);
    } catch (error) {
      setResult(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='test-section'>
      <h2>Direct API Usage (getCapnWebStub)</h2>
      <button
        type='button'
        className='action-button'
        onClick={handleDirectCall}
        disabled={loading}
        data-testid='direct-call-btn'
      >
        {loading ? 'Calling...' : 'Make Direct API Call'}
      </button>
      {result && (
        <div
          className={`test-result ${
            result.startsWith('Success') ? 'test-success' : 'test-error'
          }`}
          data-testid='direct-call-result'
        >
          {result}
        </div>
      )}
    </div>
  );
}

function MessagePortInfo() {
  return (
    <div className='test-section'>
      <h2>About MessagePort Transport</h2>
      <div className='worker-section'>
        <h3>Characteristics:</h3>
        <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
          <li>Efficient structured clone communication</li>
          <li>Bidirectional RPC support</li>
          <li>No automatic reconnection (one-time use)</li>
          <li>Perfect for Web Workers and iframes</li>
          <li>Same-origin by default (secure)</li>
        </ul>
      </div>
      <div className='info-box' style={{ marginTop: '12px' }}>
        ℹ️ This demo uses a real Web Worker for authentic cross-context
        communication.
      </div>
    </div>
  );
}

function App() {
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializeWorker()
      .then(() => {
        setInitialized(true);
      })
      .catch((err) => {
        console.error('Failed to initialize worker:', err);
        setError(err.message);
      });

    return () => {
      // Cleanup worker on unmount
      if (worker) {
        worker.terminate();
      }
    };
  }, []);

  if (error) {
    return (
      <div data-testid='message-port-demo'>
        <div className='test-result test-error'>
          Failed to initialize worker: {error}
        </div>
      </div>
    );
  }

  if (!initialized || !capnWebHooks) {
    return (
      <div data-testid='message-port-demo'>
        <div>Initializing worker...</div>
      </div>
    );
  }

  return (
    <div data-testid='message-port-demo'>
      <PortStatus />
      <MessagePortInfo />
      <ErrorBoundary>
        <React.Suspense fallback={<div>Loading...</div>}>
          <ApiTests />
        </React.Suspense>
      </ErrorBoundary>
      <ErrorBoundary>
        <React.Suspense fallback={<div>Loading...</div>}>
          <UseCapnWebTests />
        </React.Suspense>
      </ErrorBoundary>
      <ErrorBoundary>
        <React.Suspense fallback={<div>Loading...</div>}>
          <ApiTests />
        </React.Suspense>
        <DirectApiUsage />
      </ErrorBoundary>
      <ManualPortControl />
    </div>
  );
}

// Mount the app
const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
} else {
  console.error('Could not find #app element');
}
