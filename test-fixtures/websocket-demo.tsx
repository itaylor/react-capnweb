/// <reference lib="dom" />
// deno-lint-ignore no-unused-vars verbatim-module-syntax
import React, { Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initCapnWebSocket } from '../websocket.tsx';

// Mock API interface for testing
interface TestApi {
  echo(message: string): Promise<string>;
  getTimestamp(): Promise<number>;
  add(a: number, b: number): Promise<number>;
}

// Initialize WebSocket connection
const {
  CapnWebProvider,
  useCapnWebApi,
  useCapnWeb,
  useConnectionState,
  close,
} = initCapnWebSocket<TestApi>('ws://127.0.0.1:8081', {
  timeout: 2000,
  retries: 3,
  backoffStrategy: (retryCount) => retryCount * 500,
  onConnected: () => {
    console.log('[Callback] Connected');
  },
  onDisconnected: (reason) => {
    console.log('[Callback] Disconnected:', reason);
  },
  onReconnecting: (attempt) => {
    console.log('[Callback] Reconnecting, attempt:', attempt);
  },
  onReconnectFailed: () => {
    console.log('[Callback] All retries exhausted');
  },
});

function ConnectionStatus() {
  const state = useConnectionState();

  const getStatusClass = () => {
    switch (state.status) {
      case 'connected':
        return 'status-badge status-connected';
      case 'connecting':
        return 'status-badge status-connecting';
      case 'reconnecting':
        return 'status-badge status-reconnecting';
      case 'disconnected':
        return 'status-badge status-disconnected';
      case 'closed':
        return 'status-badge status-closed';
    }
  };

  const getStatusText = () => {
    switch (state.status) {
      case 'connected':
        return '✓ Connected';
      case 'connecting':
        return `⏳ Connecting${
          state.attempt > 0 ? ` (attempt ${state.attempt})` : ''
        }`;
      case 'reconnecting':
        return `🔄 Reconnecting (attempt ${state.attempt}${
          state.nextRetryMs
            ? `, next in ${Math.round(state.nextRetryMs / 1000)}s`
            : ''
        })`;
      case 'disconnected':
        return `⚠ Disconnected${state.reason ? `: ${state.reason}` : ''}`;
      case 'closed':
        return '🔒 Closed';
    }
  };

  return (
    <div className='test-section'>
      <h2>Connection State</h2>
      <div
        className={getStatusClass()}
        data-testid='connection-status'
        data-status={state.status}
      >
        {getStatusText()}
      </div>
      <div style={{ marginTop: '12px', fontSize: '14px', color: '#64748b' }}>
        Current status: <code data-testid='status-value'>{state.status}</code>
        {state.status === 'reconnecting' && state.attempt && (
          <>
            {' '}
            | Attempt: <span data-testid='retry-attempt'>{state.attempt}</span>
          </>
        )}
      </div>
    </div>
  );
}

function ManualConnectionControl() {
  const [closed, setClosed] = useState(false);

  const handleClose = () => {
    close();
    setClosed(true);
  };

  return (
    <div className='test-section'>
      <h2>Manual Connection Control</h2>
      <button
        type='button'
        className='action-button'
        onClick={handleClose}
        disabled={closed}
        data-testid='close-connection-btn'
      >
        Close Connection
      </button>
      {closed && (
        <div
          className='test-result test-success'
          data-testid='close-confirmation'
        >
          Connection closed manually
        </div>
      )}
    </div>
  );
}

function ApiTests() {
  const api = useCapnWebApi();
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addResult = (message: string) => {
    setTestResults((
      prev,
    ) => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const runTests = async () => {
    setIsRunning(true);
    setTestResults([]);

    try {
      // Test 1: Echo
      addResult('Testing echo...');
      const echoResult = await api.echo('Hello WebSocket');
      if (echoResult === 'Hello WebSocket') {
        addResult('✓ Echo test passed');
      } else {
        addResult(
          `✗ Echo test failed: expected "Hello WebSocket", got "${echoResult}"`,
        );
      }

      // Test 2: Get timestamp
      addResult('Testing getTimestamp...');
      const timestamp = await api.getTimestamp();
      if (typeof timestamp === 'number' && timestamp > 0) {
        addResult(`✓ Timestamp test passed: ${timestamp}`);
      } else {
        addResult(`✗ Timestamp test failed: ${timestamp}`);
      }

      // Test 3: Add numbers
      addResult('Testing add...');
      const sum = await api.add(5, 3);
      if (sum === 8) {
        addResult('✓ Add test passed: 5 + 3 = 8');
      } else {
        addResult(`✗ Add test failed: expected 8, got ${sum}`);
      }

      // Test 4: Multiple concurrent calls
      addResult('Testing concurrent calls...');
      const [r1, r2, r3] = await Promise.all([
        api.add(1, 1),
        api.add(2, 2),
        api.add(3, 3),
      ]);
      if (r1 === 2 && r2 === 4 && r3 === 6) {
        addResult('✓ Concurrent calls test passed');
      } else {
        addResult(`✗ Concurrent calls test failed: [${r1}, ${r2}, ${r3}]`);
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
        <div
          className='message-list'
          data-testid='test-results'
        >
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
  // Simple demonstration of useCapnWeb's promise chaining.
  const result = useCapnWeb((api) => {
    const p1 = api.add(1, 1);
    const p2 = api.add(p1 as any as number, 2);
    return api.add(p2 as any as number, 4);
  });

  const isValid = result === 8;

  return (
    <div className='test-section'>
      <h2>useCapnWeb Demo</h2>
      <div className='info-box'>
        ℹ️ useCapnWeb provides for promise chaining where the computations
        happen on the server side
      </div>
      <div
        className='message-list'
        data-testid='usecapnweb-test-results'
        style={{ marginTop: '12px' }}
      >
        <div className='message-item'>
          {new Date().toLocaleTimeString()}: Testing useCapnWeb promise chaining
        </div>
        <div className='message-item'>
          {isValid
            ? `✓ useCapnWeb promise chaining passed with result  [${result}}]`
            : `✗ useCapnWeb batched calls failed: [${result}]`}
        </div>
        <div className='message-item'>
          All useCapnWeb tests completed!
        </div>
      </div>
    </div>
  );
}

function SuspenseTest() {
  const [userId, setUserId] = useState<string | null>(null);

  return (
    <div className='test-section'>
      <h2>Suspense Integration Test</h2>
      <button
        type='button'
        className='action-button'
        onClick={() => setUserId('user-123')}
        data-testid='load-with-suspense-btn'
      >
        Load Data with Suspense
      </button>
      <button
        type='button'
        className='action-button'
        onClick={() => setUserId(null)}
        data-testid='clear-suspense-btn'
      >
        Clear
      </button>
      {userId && (
        <Suspense
          fallback={
            <div
              className='test-result'
              style={{ background: '#fef3c7', color: '#92400e' }}
              data-testid='suspense-loading'
            >
              ⏳ Loading...
            </div>
          }
        >
          <div data-testid='suspense-content'>
            <UserData userId={userId} />
          </div>
        </Suspense>
      )}
    </div>
  );
}

function UserData({ userId }: { userId: string }) {
  // Note: In a real test, this would use useCapnWeb
  // For now, we'll simulate it
  return (
    <div className='test-result test-success' data-testid='user-data'>
      User data loaded for: {userId}
    </div>
  );
}

function CallbackLogger() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // Set up console.log interception to capture callback logs
    const originalLog = console.log;
    console.log = (...args) => {
      const message = args.join(' ');
      if (message.startsWith('[Callback]')) {
        setLogs((prev) => [
          ...prev,
          `${new Date().toLocaleTimeString()}: ${message}`,
        ]);
      }
      originalLog(...args);
    };

    return () => {
      console.log = originalLog;
    };
  }, []);

  return (
    <div className='test-section'>
      <h2>Connection Callbacks Log</h2>
      {logs.length === 0
        ? (
          <div style={{ color: '#64748b', fontSize: '14px' }}>
            No callbacks fired yet
          </div>
        )
        : (
          <div className='message-list' data-testid='callback-logs'>
            {logs.map((log, i) => (
              <div key={i} className='message-item'>
                {log}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function App() {
  return (
    <CapnWebProvider>
      <div data-testid='websocket-demo'>
        <ConnectionStatus />
        <ApiTests />
        <UseCapnWebTests />
        <SuspenseTest />
        <ManualConnectionControl />
        <CallbackLogger />
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
