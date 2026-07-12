/// <reference lib="dom" />
// Preact variant of the HTTP Batch demo. Bundled with deno.preact.jsonc,
// which aliases 'react' → 'preact/compat', so the library modules imported
// below are compiled against Preact — the same setup a consuming Preact app
// uses. Exercises the throw-protocol Suspense fallback in core.tsx's
// readPromise (preact/compat has no `use()`).
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { Component, Suspense } from 'preact/compat';
import type { ComponentChildren } from 'preact';
import { initCapnHttpBatch } from '../http-batch.tsx';

// Same mock API the server implements for the React demos.
interface TestApi {
  echo(message: string): Promise<string>;
  getTimestamp(): Promise<number>;
  add(a: number, b: number): Promise<number>;
  getUserData(userId: string): Promise<{ id: string; name: string }>;
}

const { useCapnWeb, useCapnWebQuery, getCapnWebStub } = initCapnHttpBatch<
  TestApi
>('/api/rpc', {
  credentials: 'same-origin',
  onError: (error) => {
    console.error('[HTTP Batch Error]:', error);
  },
});

class ErrorBoundary extends Component<
  { children: ComponentChildren },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ComponentChildren }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static override getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
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

/** useCapnWeb through Suspense — the core assertion of the Preact port:
 *  pending renders the fallback (thrown promise), settled renders the value
 *  synchronously from the tracker, and re-querying on a prop change works.
 *
 *  Note the shape: the `count` state lives in the SECTION, above the Suspense
 *  boundary, and flows into the suspending component as a prop. Under Preact
 *  a mounted component that suspends again is unmounted while the fallback
 *  shows, losing its own hook state (React 19's `use` preserves it) — so
 *  state that must survive re-suspension belongs above the boundary. See the
 *  README's Preact section.
 */
function UseCapnWebResult({ count }: { count: number }) {
  const result = useCapnWeb('add', 10, count);

  return (
    <div
      className='message-list'
      data-testid='usecapnweb-test-results'
    >
      <div className='message-item'>
        10 + {count} = {result}
      </div>
      <div className='message-item'>
        {result === count + 10 ? '✓ Success!' : '✗ Failed'}
      </div>
    </div>
  );
}

function UseCapnWebDemo() {
  const [count, setCount] = useState(1);

  return (
    <div className='test-section'>
      <h2>useCapnWeb Demo (Preact)</h2>
      <ErrorBoundary>
        <Suspense fallback={<div data-testid='suspense-loading'>Loading...</div>}>
          <UseCapnWebResult count={count} />
        </Suspense>
      </ErrorBoundary>
      <button
        type='button'
        className='action-button'
        data-testid='increment-btn'
        onClick={() => setCount((c) => c + 1)}
      >
        Increment
      </button>
    </div>
  );
}

/** useCapnWebQuery batching three pipelined calls into one HTTP request. */
function UseCapnWebQueryDemo() {
  const batchResult = useCapnWebQuery('preactBatchTest', (api) => {
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
      <h2>useCapnWebQuery Demo (Preact)</h2>
      <div
        className='message-list'
        data-testid='usecapnwebquery-test-results'
      >
        <div className='message-item'>
          {isValid
            ? `✓ Batched calls passed: [${batchResult?.join(', ')}]`
            : `✗ Batched calls failed: [${batchResult?.join(', ')}]`}
        </div>
        <div className='message-item'>All useCapnWebQuery tests completed!</div>
      </div>
    </div>
  );
}

/** Imperative stub usage from an event handler (not a hook). */
function DirectApiUsage() {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleDirectCall = async () => {
    setLoading(true);
    try {
      const api = getCapnWebStub();
      const p1 = api.echo('Direct Preact call');
      const p2 = api.add(2, 3);
      const [echoed, sum] = await Promise.all([p1, p2]);
      setResult(
        echoed === 'Direct Preact call' && sum === 5
          ? `Success: ${echoed} / 2 + 3 = ${sum}`
          : `Error: unexpected results ${echoed} / ${sum}`,
      );
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

/** A rejected RPC promise must reach the error boundary via the throw
 *  protocol's rethrow path (tracker.status === 'rejected'). */
function SuspenseErrorDemo() {
  useCapnWebQuery(
    'preactErrorTest',
    (api) => (api as any).nonExistentMethod() as Promise<never>,
  );
  return <div>Unexpected success</div>;
}

function ErrorHandlingDemo() {
  return (
    <div className='test-section'>
      <h2>Suspense Error Handling (Preact)</h2>
      <div data-testid='error-result'>
        <ErrorBoundary>
          <Suspense fallback={<div>Loading...</div>}>
            <SuspenseErrorDemo />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

function App() {
  return (
    <div data-testid='http-batch-preact-demo'>
      <UseCapnWebDemo />
      <ErrorBoundary>
        <Suspense fallback={<div>Loading...</div>}>
          <UseCapnWebQueryDemo />
        </Suspense>
      </ErrorBoundary>
      <DirectApiUsage />
      <ErrorHandlingDemo />
    </div>
  );
}

const container = document.getElementById('app');
if (container) {
  render(<App />, container);
} else {
  console.error('Could not find #app element');
}
