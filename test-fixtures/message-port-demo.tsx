/// <reference lib="dom" />
// deno-lint-ignore no-unused-vars verbatim-module-syntax
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initCapnMessagePort } from '../message-port.tsx';
import { newMessagePortRpcSession, RpcTarget } from 'capnweb';

// Mock API interface for testing
interface TestApi extends RpcTarget {
  echo(message: string): string;
  add(a: number, b: number): number;
}

// Server implementation for the worker side
class TestApiImpl extends RpcTarget {
  echo(message: string): string {
    return message;
  }

  add(a: number, b: number): number {
    return a + b;
  }
}

// Create a MessageChannel for testing
const channel = new MessageChannel();

// Initialize MessagePort connection with port1
const {
  CapnWebProvider,
  useCapnWeb,
  useCapnWebStub,
  close,
} = initCapnMessagePort<TestApi>(channel.port1, {
  onDisconnect: () => {
    console.log('[MessagePort] Disconnected');
  },
});

// Simulate a "worker" on port2 using capnweb RPC
function setupSimulatedWorker() {
  const port2 = channel.port2;

  try {
    // Create a capnweb RPC session on the worker side
    newMessagePortRpcSession(port2, new TestApiImpl());
    console.log('[Simulated Worker] Capnweb RPC session initialized');
  } catch (error) {
    console.error('[Simulated Worker] Failed to initialize:', error);
  }
}

function PortStatus() {
  const [status, setStatus] = useState<'ready' | 'closed'>('ready');

  useEffect(() => {
    // Note: MessagePort close detection has limited browser support
    const checkStatus = () => {
      try {
        // Port is ready if we can still post messages
        channel.port1.postMessage('test');
        setStatus('ready');
      } catch {
        setStatus('closed');
      }
    };

    const interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className='test-section'>
      <h2>MessagePort Status</h2>
      <div className='info-box'>
        ℹ️ MessagePort provides efficient communication between contexts (e.g.,
        main thread and Web Workers). This demo uses a simulated worker for
        testing.
      </div>
      <div
        className={`test-result ${
          status === 'ready' ? 'test-success' : 'test-error'
        }`}
        data-testid='port-status'
        data-status={status}
      >
        {status === 'ready' ? '✓ Port Ready' : '✗ Port Closed'}
      </div>
    </div>
  );
}

function ApiTests() {
  const api = useCapnWebStub();
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
  const result = useCapnWeb('add', 5, count);

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
    close();
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
  const api = useCapnWebStub();
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
      <h2>Direct API Usage (useCapnWebStub)</h2>
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
        ℹ️ Note: This demo uses a simulated worker (MessageChannel with both
        ports in same context). In real usage, you'd send one port to a Worker
        or iframe.
      </div>
    </div>
  );
}

function App() {
  useEffect(() => {
    // Setup the simulated worker
    setupSimulatedWorker();
  }, []);

  return (
    <CapnWebProvider>
      <div data-testid='message-port-demo'>
        <PortStatus />
        <MessagePortInfo />
        <ApiTests />
        <React.Suspense fallback={<div>Loading...</div>}>
          <UseCapnWebTests />
        </React.Suspense>
        <DirectApiUsage />
        <ManualPortControl />
      </div>
    </CapnWebProvider>
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
