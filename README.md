# react-capnweb

React hooks and components for
[capnweb](https://github.com/cloudflare/capnweb) - A JavaScript-native RPC system, supporting multiple transport protocols.

## Overview

`react-capnweb` provides React bindings for working with capnweb RPC connections
across different transport mechanisms:

- **Multiple transports** - WebSocket, HTTP Batch, MessagePort, or custom
  implementations
- **Tree-shakable** - Each transport in a separate module for optimal bundle
  size
- **Consistent API** - Same React hooks across all transports
- **TypeScript support** - Full type safety for your RPC calls
- **Automatic reconnection** - For WebSocket connections
- **Bidirectional RPC** - Server can call client methods (WebSocket,
  MessagePort)

## Installation

### Deno (JSR)

```bash
deno add @itaylor/react-capnweb
```

### Node.js (npm)

```bash
npm install @itaylor/react-capnweb
```


## Usage

### Basic Setup

1. **Initialize your transport:**

```typescript
import { initCapnWebSocket } from '@itaylor/react-capnweb/websocket';
import type { MyApiInterface } from './my-api-schema';

const { CapnWebProvider, useCapnWeb, useCapnWebApi } = initCapnWebSocket<
  MyApiInterface
>('ws://localhost:8080/api');
```

2. **Wrap your app with the provider:**

```typescript
function App() {
  return (
    <CapnWebProvider>
      <YourComponents />
    </CapnWebProvider>
  );
}
```

3. **Use the hooks in your components:**

```typescript
function UserProfile({ userId }: { userId: string }) {
  // Simple: Uses React Suspense
  const userData = useCapnWeb(
    (api) => api.getUser(userId),
    [userId],
  );

  return (
    <div>
      <h1>{userData?.name}</h1>
      <p>{userData?.email}</p>
    </div>
  );
}
```

### Direct API Access

For more control, use `useCapnWebApi()`:

```typescript
function UserManager() {
  const api = useCapnWebApi();
  const [users, setUsers] = useState([]);

  async function loadUsers() {
    const data = await api.listUsers();
    setUsers(data);
  }

  async function createUser(name: string, email: string) {
    await api.createUser({ name, email });
    loadUsers();
  }

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div>
      <button onClick={() => createUser('Alice', 'alice@example.com')}>
        Add User
      </button>
      <ul>
        {users.map((user) => <li key={user.id}>{user.name}</li>)}
      </ul>
    </div>
  );
}
```

### Bidirectional RPC (WebSocket / MessagePort)

The server can call methods on your client:

```typescript
import { RpcTarget } from 'capnweb';

class ClientApi extends RpcTarget {
  showNotification(message: string) {
    toast.show(message);
  }

  updateProgress(percent: number) {
    progressBar.update(percent);
  }
}

const { CapnWebProvider } = initCapnWebSocket<ServerApi>(
  'ws://localhost:8080',
  {
    localMain: new ClientApi(), // Server can call these methods
  },
);
```


## Transport Options

### WebSocket

Persistent bidirectional connection for real-time communication.

**Best for:**

- Real-time applications
- Long-lived connections
- Server-initiated updates
- Low-latency requirements

```typescript
import { initCapnWebSocket } from '@itaylor/react-capnweb/websocket';

const {
  CapnWebProvider,
  useCapnWeb,
  useCapnWebApi,
  close,
  useConnectionState,
} = initCapnWebSocket<MyApi>(
  'ws://localhost:8080/api',
  {
    timeout: 5000, // Connection timeout in ms
    retries: 10, // Max reconnection attempts
    backoffStrategy: (retryCount) => retryCount * 1000, // Optional: custom backoff
    localMain: new MyClientApi(), // Optional: expose API to server
    onConnected: () => console.log('Connected!'),
    onDisconnected: (reason) => console.log('Disconnected:', reason),
    onReconnecting: (attempt) => console.log('Reconnecting, attempt', attempt),
    onReconnectFailed: () => console.log('All retries exhausted'),
  },
);

// The WebSocket connection persists across provider mount/unmount.
// To manually close the connection when needed:
// close();

// Track connection state in your components:
function ConnectionStatus() {
  const state = useConnectionState();

  if (state.status === 'connecting') {
    return <div>Connecting...</div>;
  }
  if (state.status === 'reconnecting') {
    return <div>Reconnecting (attempt {state.attempt})...</div>;
  }
  if (state.status === 'connected') {
    return <div>Connected</div>;
  }
  return <div>Disconnected</div>;
}
```

### HTTP Batch

Stateless HTTP requests for serverless and edge deployments.

**Best for:**

- Serverless/edge functions
- CDN-friendly applications
- Simple request/response patterns
- Better proxy/load balancer compatibility

**Note:** HTTP Batch sessions are single-use per batch. Each call to
`useCapnWeb()` or `useCapnWebApi()` creates a new batch session. To batch
multiple calls together, get the api once and make all calls before awaiting any
of them.

**Important:** `useCapnWebApi()` is not actually a React hook - it doesn't use
context or state, just creates a fresh session. This means you can call it
anywhere, including inside async functions and event handlers.

```typescript
import { initCapnHttpBatch } from '@itaylor/react-capnweb/http-batch';

const { CapnWebProvider, useCapnWeb, useCapnWebApi } = initCapnHttpBatch<MyApi>(
  '/api/rpc',
  {
    headers: { 'Authorization': 'Bearer token123' },
    credentials: 'include',
  },
);

function MyComponent() {
  const executeBatch = useCapnWebBatch();

  // ✅ Single batch - all calls in one HTTP request
  const [user, posts, comments] = useCapnWeb((api) => {
    const userPromise = api.getUser('123');
    const postsPromise = api.getUserPosts('123');
    const commentsPromise = api.getUserComments('123');
    return Promise.all([userPromise, postsPromise, commentsPromise]);
  }, ['123']);

  // ✅ Or call useCapnWebApi in async handlers (NOT a real React hook!)
  const handleAction = async () => {
    // Each call to useCapnWebApi() creates a new session
    const result1 = await useCapnWebApi().getUser('123'); // Batch 1
    const result2 = await useCapnWebApi().getPosts('123'); // Batch 2

    // To batch multiple calls together, get api once before awaiting:
    const api = useCapnWebApi();
    const p1 = api.getUser('123');
    const p2 = api.getComments('123');
    const [user, comments] = await Promise.all([p1, p2]); // Single batch
  };
}
```

### MessagePort

Communication with Web Workers, iframes, and Service Workers.

**Best for:**

- Web Worker communication
- iframe messaging
- Service Worker integration
- Isolated JavaScript contexts

```typescript
import { initCapnMessagePort } from '@itaylor/react-capnweb/message-port';

const channel = new MessageChannel();

const { CapnWebProvider, useCapnWebApi, close } = initCapnMessagePort<
  WorkerApi
>(
  channel.port1,
  {
    localMain: new ParentApi(), // Optional: expose API to worker
  },
);

// The MessagePort connection persists across provider mount/unmount.
// To manually close the connection when needed:
// close();

// Send port2 to worker
worker.postMessage({ port: channel.port2 }, [channel.port2]);
```

### Custom Transport

Implement your own transport for custom protocols.

**Best for:**

- Custom networking protocols
- Testing with mock transports
- Adding middleware (logging, encryption)
- Specialized communication channels

```typescript
import { initCapnCustomTransport } from '@itaylor/react-capnweb/custom-transport';
import type { RpcTransport } from 'capnweb';

class MyTransport implements RpcTransport {
  async send(message: string): Promise<void> {/* ... */}
  async receive(): Promise<string> {/* ... */}
  abort?(reason: any): void {/* ... */}
}

const { CapnWebProvider, useCapnWeb, useCapnWebApi, close } =
  initCapnCustomTransport<
    MyApi
  >(new MyTransport(), {
    localMain: new MyLocalApi(),
  });

// The transport connection persists across provider mount/unmount.
// To manually close the connection when needed:
// close();
```



## API Reference

### Common Interface

All transport initialization functions return the same `CapnWebHooks<T>`
interface:

```typescript
interface CapnWebHooks<T> {
  CapnWebProvider: (props: { children: React.ReactNode }) => React.ReactElement;
  useCapnWeb: <TResult>(
    fn: (api: RpcApi<T>) => Promise<TResult>,
    deps?: any[],
  ) => TResult | undefined;
  useCapnWebApi: () => RpcApi<T>;
  close: () => void; // Manually close the connection and dispose the session
}
```

**Note:** All transports include a `close()` function for manual resource
cleanup:

- **WebSocket**: Closes the connection and prevents reconnection
- **MessagePort**: Closes the port and disposes the session
- **Custom Transport**: Calls `abort()` on the transport if available and
  disposes the session
- **HTTP Batch**: No `close()` function; sessions are automatically cleaned up
  after each batch

### `CapnWebProvider`

Provider component that manages the RPC session lifecycle. Must wrap any
components that use the hooks.

### `useCapnWeb<TResult>(fn, deps?)`

Hook that makes an RPC call with React Suspense support.

**Parameters:**

- `fn`: Function that takes the API and returns a Promise
- `deps`: Dependency array (like `useEffect`)

**Returns:** The resolved value from the RPC call, or `undefined` while loading

**Example:**

```typescript
const user = useCapnWeb((api) => api.getUser(userId), [userId]);
```

### `useCapnWebApi()`

Hook that returns direct access to the RPC API stub.

**Returns:** `RpcApi<T>` - The typed RPC API stub

**Example:**

```typescript
const api = useCapnWebApi();
const result = await api.someMethod();
```

## Transport-Specific Options

### WebSocket Options

```typescript
interface WebSocketOptions {
  timeout?: number; // Connection timeout in ms (default: 5000)
  retries?: number; // Max reconnection attempts (default: 10)
  backoffStrategy?: (retryCount: number) => number; // Delay calculation function
  localMain?: any; // Local API for bidirectional RPC
  sessionOptions?: RpcSessionOptions; // Additional capnweb options
  onConnected?: () => void; // Callback when connection established
  onDisconnected?: (reason?: string) => void; // Callback when connection lost
  onReconnecting?: (attempt: number) => void; // Callback when reconnection starts
  onReconnectFailed?: () => void; // Callback when all retries exhausted
}

// Returns:
interface WebSocketCapnWebHooks<T> extends CapnWebHooks<T> {
  useConnectionState: () => WebSocketConnectionState;
}

type WebSocketConnectionState =
  | { status: 'connecting'; attempt: number }
  | { status: 'connected' }
  | { status: 'reconnecting'; attempt: number; nextRetryMs?: number }
  | { status: 'disconnected'; reason?: string }
  | { status: 'closed' };

// Connection Lifecycle:
// - WebSocket connection persists across provider mount/unmount
// - Only closes when disconnected, retries exhausted, or close() is called
```

**Backoff Strategy:**

The `backoffStrategy` function controls the delay before each reconnection
attempt. It receives the current retry count (1-indexed) and returns the delay
in milliseconds.

Default: Exponential backoff with jitter

- Base delay: 1s, doubles each retry (1s, 2s, 4s, 8s, 16s, max 30s)
- Adds random jitter of 0-1000ms to prevent thundering herd

```typescript
// Custom fixed delay of 5 seconds
backoffStrategy: (() => 5000);

// Linear backoff: 2s, 4s, 6s, 8s...
backoffStrategy: ((retryCount) => retryCount * 2000);

// Custom exponential without jitter, max 60s
backoffStrategy: ((retryCount) =>
  Math.min(1000 * Math.pow(2, retryCount - 1), 60000));
```

**Connection State Hook:**

The `useConnectionState()` hook returns the current connection state, allowing
you to display connection status in your UI.

```typescript
function ConnectionIndicator() {
  const state = useConnectionState();

  switch (state.status) {
    case 'connecting':
      return <Spinner>Connecting...</Spinner>;

    case 'connected':
      return <Badge color='green'>Connected</Badge>;

    case 'reconnecting':
      return (
        <Banner>
          Reconnecting... (attempt {state.attempt})
          {state.nextRetryMs &&
            ` Next retry in ${Math.round(state.nextRetryMs / 1000)}s`}
        </Banner>
      );

    case 'disconnected':
      return <Alert>Disconnected{state.reason && `: ${state.reason}`}</Alert>;

    case 'closed':
      return <Badge color='gray'>Connection closed</Badge>;
  }
}
```

**Connection Callbacks:**

Use callbacks for side effects like logging, analytics, or notifications:

```typescript
initCapnWebSocket<MyApi>('ws://localhost:8080', {
  onConnected: () => {
    console.log('WebSocket connected');
    analytics.track('ws_connected');
  },
  onDisconnected: (reason) => {
    console.warn('WebSocket disconnected:', reason);
  },
  onReconnecting: (attempt) => {
    toast.info(`Reconnecting (attempt ${attempt})...`);
  },
  onReconnectFailed: () => {
    toast.error('Unable to reconnect. Please refresh the page.');
  },
});
```

### HTTP Batch Options

```typescript
interface HttpBatchOptions {
  headers?: Record<string, string>; // Custom request headers
  credentials?: RequestCredentials; // 'include', 'same-origin', etc.
  mode?: RequestMode; // 'cors', 'no-cors', etc.
  cache?: RequestCache; // Cache mode
  redirect?: RequestRedirect; // Redirect handling
  referrerPolicy?: ReferrerPolicy; // Referrer policy
  sessionOptions?: RpcSessionOptions; // Additional capnweb options
  onError?: (error: Error) => void; // Error handler
}
```

**HTTP Batch behavioral notes:**

HTTP Batch uses the same API as other transports, but has different session
lifecycle behavior because capnweb HTTP Batch sessions are single-use per batch:

- Each call to `useCapnWeb()` or `useCapnWebApi()` creates a new batch session
- `useCapnWebApi()` is **not actually a React hook** - it doesn't use context or
  state, it just creates a fresh session each time. This means you can call it
  anywhere, including inside async functions and event handlers
- To batch multiple calls together, get the api once and make all calls before
  awaiting any of them
- Don't await inside the `useCapnWeb()` callback - the batch ends when you await

**Batching examples:**

```typescript
// ✅ Single batch - get api once, make calls, then await
const api = useCapnWebApi();
const p1 = api.call1();
const p2 = api.call2();
const [r1, r2] = await Promise.all([p1, p2]); // Batch sent here

// ✅ Single batch with useCapnWeb
const result = useCapnWeb((api) => {
  const p1 = api.call1();
  const p2 = api.call2();
  return Promise.all([p1, p2]);
});

// ✅ Promise pipelining (single batch)
const result = useCapnWeb((api) => {
  const userId = api.lookupUser('alice');
  return api.getUserData(userId); // userId resolved on server
});

// ✅ Multiple batches - call useCapnWebApi() fresh each time (NOT a real hook!)
const r1 = await useCapnWebApi().call1(); // HTTP request 1
const r2 = await useCapnWebApi().call2(); // HTTP request 2

// ❌ Won't work - awaiting inside useCapnWeb ends the batch
const result = useCapnWeb(async (api) => {
  const r1 = await api.call1(); // Batch ends here
  const r2 = await api.call2(); // Session already closed!
  return [r1, r2];
});
```

### MessagePort Options

```typescript
interface MessagePortOptions {
  localMain?: any; // Local API for bidirectional RPC
  sessionOptions?: RpcSessionOptions; // Additional capnweb options
  onDisconnect?: () => void; // Disconnect callback (limited browser support)
}

// Note: onDisconnect uses the 'close' event which has limited browser support.
// Connection persists across provider mount/unmount.
```

### Custom Transport Options

```typescript
interface CustomTransportOptions {
  localMain?: any; // Local API for bidirectional RPC
  sessionOptions?: RpcSessionOptions; // Additional capnweb options
  onError?: (error: Error) => void; // Error handler
}

// Connection persists across provider mount/unmount.
```

## Features

### Type Safety

### WebSocket Connection Lifecycle

The WebSocket connection persists across provider mount/unmount cycles. This
means:

- Connection is created once when the first provider mounts
- Connection stays open even if the provider unmounts (e.g., during navigation)
- Connection only closes when it disconnects/errors and exhausts retries, or
  when you call `close()`

```typescript
const { CapnWebProvider, close } = initCapnWebSocket<MyApi>(
  'ws://localhost:8080/api',
);

function App() {
  useEffect(() => {
    // Cleanup function to close connection when app unmounts
    return () => close();
  }, []);

  return (
    <CapnWebProvider>
      <YourApp />
    </CapnWebProvider>
  );
}
```

This design is efficient for app-level WebSocket connections that should survive
navigation and component remounting.

### Type Safety

All RPC calls are fully typed based on your Cap'n Proto schema:

```typescript
interface MyApi extends RpcTarget {
  getUser(id: string): Promise<User>;
  listUsers(): Promise<User[]>;
}

// TypeScript knows the return types!
const user = useCapnWeb((api) => api.getUser('123'), ['123']);
// user is typed as User | undefined
```

### React Suspense Support

The `useCapnWeb` hook integrates with React Suspense boundaries:

```typescript
<Suspense fallback={<Loading />}>
  <UserProfile userId='123' />
</Suspense>;
```

### Tree-Shaking

Import only the transport you need for optimal bundle size:

```typescript
// Only includes WebSocket transport code
import { initCapnWebSocket } from '@itaylor/react-capnweb/websocket';

// Only includes HTTP Batch transport code
import { initCapnHttpBatch } from '@itaylor/react-capnweb/http-batch';
```

## Comparison of Transports

| Feature                | WebSocket  | HTTP Batch    | MessagePort | Custom  |
| ---------------------- | ---------- | ------------- | ----------- | ------- |
| Persistent connection  | ✅         | ❌            | ✅          | Depends |
| Automatic reconnection | ✅         | N/A           | ❌          | Custom  |
| Bidirectional RPC      | ✅         | ❌            | ✅          | Depends |
| Server push            | ✅         | ❌            | ✅          | Depends |
| Serverless friendly    | ❌         | ✅            | N/A         | Depends |
| CDN compatible         | ❌         | ✅            | N/A         | Depends |
| Worker/iframe support  | ❌         | ❌            | ✅          | Depends |
| Latency                | Low        | Medium        | Very Low    | Depends |
| Session lifecycle      | Long-lived | Single-use⁽¹⁾ | Long-lived  | Depends |

**⁽¹⁾ Note:** HTTP Batch sessions are single-use per batch. Each call to
`useCapnWeb()` or method call via `useCapnWebApi()` creates a new session. To
batch multiple calls together, make all calls before awaiting any of them.

## Examples

### Switching Transports

The beauty of the consistent API is you can switch transports without changing
your component code:

```typescript
// Development: Use WebSocket for hot reload friendly connection
const { CapnWebProvider, useCapnWeb, useCapnWebApi } = import.meta.env.DEV
  ? initCapnWebSocket('ws://localhost:8080')
  : initCapnHttpBatch('/api/rpc');

// Note: HTTP Batch has single-use sessions, so you may need to adjust
// batching strategy, but the API is the same
```

### Multi-Transport Application

Use different transports for different purposes:

```typescript
// Main API via HTTP Batch for serverless
const httpApi = initCapnHttpBatch<MainApi>('/api/rpc');

// Real-time updates via WebSocket
const wsApi = initCapnWebSocket<RealtimeApi>('ws://localhost:8080/live');

function App() {
  return (
    <httpApi.CapnWebProvider>
      <wsApi.CapnWebProvider>
        <YourApp />
      </wsApi.CapnWebProvider>
    </httpApi.CapnWebProvider>
  );
}

function YourApp() {
  // Both use the same API!
  const httpData = httpApi.useCapnWebApi();
  const wsData = wsApi.useCapnWebApi();

  // HTTP Batch: batch calls together by not awaiting immediately
  const loadData = async () => {
    const p1 = httpData.getUser();
    const p2 = httpData.getSettings();
    const [user, settings] = await Promise.all([p1, p2]); // Single batch
  };

  // WebSocket: call anytime
  const subscribe = () => wsData.subscribe('updates');
}
```

## Requirements

- React 19+ (requires the `use` hook)
- capnweb 0.3.0+

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Related Projects

- [capnweb](https://github.com/cloudflare/capnweb) - JavaScript Cap'n Proto RPC
- [type-router-react](https://jsr.io/@itaylor/type-router-react) - Type-safe
  routing for React
