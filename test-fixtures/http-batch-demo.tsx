/// <reference lib="dom" />
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initCapnHttpBatch } from '../http-batch.tsx';

// Mock API interface for testing
interface TestApi {
  echo(message: string): Promise<string>;
  getTimestamp(): Promise<number>;
  add(a: number, b: number): Promise<number>;
  getUserData(userId: string): Promise<{ id: string; name: string }>;
}

// Initialize HTTP Batch connection
const {
  CapnWebProvider,
  useCapnWeb,
  useCapnWebApi,
} = initCapnHttpBatch<TestApi>('/api/rpc', {
  headers: {
    'X-Test-Header': 'test-value',
  },
  credentials: 'same-origin',
  onError: (error) => {
    console.error('[HTTP Batch Error]:', error);
  },
});

function ApiTests() {
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
      // Test 1: Simple echo
      addResult('Testing echo...');
      const echoResult = await useCapnWebApi().echo('Hello HTTP Batch');
      if (echoResult === 'Hello HTTP Batch') {
        addResult('✓ Echo test passed');
      } else {
        addResult(
          `✗ Echo test failed: expected "Hello HTTP Batch", got "${echoResult}"`,
        );
      }

      // Test 2: Get timestamp
      addResult('Testing getTimestamp...');
      const timestamp = await useCapnWebApi().getTimestamp();
      if (typeof timestamp === 'number' && timestamp > 0) {
        addResult(`✓ Timestamp test passed: ${timestamp}`);
      } else {
        addResult(`✗ Timestamp test failed: ${timestamp}`);
      }

      // Test 3: Add numbers
      addResult('Testing add...');
      const sum = await useCapnWebApi().add(10, 5);
      if (sum === 15) {
        addResult('✓ Add test passed: 10 + 5 = 15');
      } else {
        addResult(`✗ Add test failed: expected 15, got ${sum}`);
      }

      // Test 4: Get user data
      addResult('Testing getUserData...');
      const userData = await useCapnWebApi().getUserData('test-user-123');
      if (userData.id === 'test-user-123' && userData.name) {
        addResult(`✓ User data test passed: ${userData.name}`);
      } else {
        addResult(`✗ User data test failed: ${JSON.stringify(userData)}`);
      }

      // Test 5: Multiple sequential calls (each in separate batch/HTTP request)
      addResult('Testing sequential calls...');
      const r1 = await useCapnWebApi().add(1, 2);
      const r2 = await useCapnWebApi().add(3, 4);
      const r3 = await useCapnWebApi().add(5, 6);
      if (r1 === 3 && r2 === 7 && r3 === 11) {
        addResult('✓ Sequential calls test passed');
      } else {
        addResult(`✗ Sequential calls test failed: [${r1}, ${r2}, ${r3}]`);
      }

      // Test 6: Concurrent calls (batching test - all in one HTTP request)
      addResult('Testing concurrent calls (batching)...');
      // Create promises without awaiting to batch them together
      const api = useCapnWebApi();
      const p1 = api.add(1, 1);
      const p2 = api.add(2, 2);
      const p3 = api.add(3, 3);
      const p4 = api.add(4, 4);
      const [c1, c2, c3, c4] = await Promise.all([p1, p2, p3, p4]);
      if (c1 === 2 && c2 === 4 && c3 === 6 && c4 === 8) {
        addResult('✓ Concurrent calls test passed (likely batched)');
      } else {
        addResult(
          `✗ Concurrent calls test failed: [${c1}, ${c2}, ${c3}, ${c4}]`,
        );
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
      <h2>RPC API Tests (useCapnWebApi)</h2>
      <div className='info-box'>
        ℹ️ HTTP Batch transport makes stateless HTTP POST requests. Multiple
        concurrent calls may be automatically batched.
      </div>
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
  // Simple demonstration of useCapnWeb with batching
  // All three calls are batched into a single HTTP request
  const batchResult = useCapnWeb((api) => {
    const p1 = api.add(10, 20);
    const p2 = api.add(5, 15);
    const p3 = api.add(100, 200);
    return Promise.all([p1, p2, p3]);
  });

  const isValid = batchResult &&
    batchResult[0] === 30 &&
    batchResult[1] === 20 &&
    batchResult[2] === 300;

  return (
    <div className='test-section'>
      <h2>useCapnWeb Demo</h2>
      <div className='info-box'>
        ℹ️ useCapnWeb provides Suspense support and automatically batches calls
        within the callback function. This demo batches 3 calls in one HTTP
        request.
      </div>
      <div
        className='message-list'
        data-testid='usecapnweb-test-results'
        style={{ marginTop: '12px' }}
      >
        <div className='message-item'>
          {new Date().toLocaleTimeString()}: Testing useCapnWeb with batched
          calls...
        </div>
        <div className='message-item'>
          {isValid
            ? `✓ useCapnWeb batched calls passed: [${batchResult?.join(', ')}]`
            : `✗ useCapnWeb batched calls failed: [${batchResult?.join(', ')}]`}
        </div>
        <div className='message-item'>
          All useCapnWeb tests completed!
        </div>
      </div>
    </div>
  );
}

function ManualSessionControl() {
  return (
    <div className='test-section'>
      <h2>Manual Session Control</h2>
      <div className='info-box'>
        ℹ️ HTTP Batch has no persistent connection. Each batch is independent.
        There is no session to close.
      </div>
      <button
        type='button'
        className='action-button'
        disabled
        data-testid='close-session-btn'
      >
        No Session to Close
      </button>
      <div
        className='test-result test-success'
        data-testid='close-confirmation'
      >
        HTTP Batch is stateless - each batch creates its own session.
      </div>
    </div>
  );
}

function DirectApiUsage() {
  const api = useCapnWebApi();
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleDirectCall = async () => {
    setLoading(true);
    try {
      const response = await api.echo('Direct API call');
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
      <h2>Direct API Usage (useCapnWebApi)</h2>
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

function ErrorHandling() {
  const api = useCapnWebApi();
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const triggerError = async () => {
    setLoading(true);
    setResult('');
    try {
      // Try to call a non-existent method
      await (api as any).nonExistentMethod();
      setResult('Unexpected success');
    } catch (error) {
      setResult(
        `Error caught: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='test-section'>
      <h2>Error Handling</h2>
      <button
        type='button'
        className='action-button'
        onClick={triggerError}
        disabled={loading}
        data-testid='trigger-error-btn'
      >
        {loading ? 'Testing...' : 'Trigger Error'}
      </button>
      {result && (
        <div
          className={`test-result ${
            result.includes('Error') ? 'test-success' : 'test-error'
          }`}
          data-testid='error-result'
        >
          {result}
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <CapnWebProvider>
      <div data-testid='http-batch-demo'>
        <ApiTests />
        <UseCapnWebTests />
        <DirectApiUsage />
        <ManualSessionControl />
        <ErrorHandling />
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
