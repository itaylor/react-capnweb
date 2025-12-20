# react-capnweb

React hooks and components for
[capnweb](https://github.com/cloudflare/capnweb) - WebSocket RPC with Cap'n
Proto.

## Overview

`react-capnweb` provides React bindings for working with capnweb WebSocket RPC
connections. It includes:

- **Provider component** - Manages WebSocket connection lifecycle
- **React hooks** - Easy access to the RPC API in your components
- **Automatic reconnection** - Configurable retry logic with timeout handling
- **TypeScript support** - Full type safety for your RPC calls

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

First, initialize the WebSocket connection and get the provider and hooks:

```typescript
import { initCapnWebSocket } from '@itaylor/react-capnweb';
import type { MyApiInterface } from './my-api-schema';

// Initialize with your WebSocket URL
const { CapnWebProvider, useCapnWeb, useCapnWebApi } = initCapnWebSocket<
  MyApiInterface
>('ws://localhost:8080/api');
```

### Wrap Your App with the Provider

```typescript
function App() {
  return (
    <CapnWebProvider>
      <YourComponents />
    </CapnWebProvider>
  );
}
```

### Use the Hooks in Your Components

#### Using `useCapnWeb` for Simple RPC Calls

The `useCapnWeb` hook suspends until the promise resolves, making it work
seamlessly with React Suspense:

```typescript
function UserProfile({ userId }: { userId: string }) {
  const userData = useCapnWeb(
    (api) => api.getUser(userId),
    [userId],
  );

  if (!userData) return null;

  return (
    <div>
      <h1>{userData.name}</h1>
      <p>{userData.email}</p>
    </div>
  );
}
```

#### Using `useCapnWebApi` for Direct API Access

For more complex scenarios, you can get direct access to the API:

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
      {/* Your UI here */}
    </div>
  );
}
```

## Configuration

You can customize the WebSocket connection behavior:

```typescript
const { CapnWebProvider, useCapnWeb, useCapnWebApi } = initCapnWebSocket<
  MyApiInterface
>('ws://localhost:8080/api', {
  timeout: 10000, // Connection timeout in milliseconds (default: 5000)
  retries: 5, // Max number of reconnection attempts (default: 10)
});
```

## Features

### Automatic Reconnection

The provider automatically attempts to reconnect when the WebSocket connection
is lost. You can configure the number of retries and timeout duration.

### Type Safety

All RPC calls are fully typed based on your Cap'n Proto schema, giving you
autocomplete and compile-time type checking.

### React Suspense Support

The `useCapnWeb` hook integrates with React's Suspense boundaries for elegant
loading states.

## API Reference

### `initCapnWebSocket<T>(wsUrl, options?)`

Initializes a capnweb WebSocket connection and returns provider and hooks.

**Parameters:**

- `wsUrl` (string): WebSocket URL to connect to
- `options` (optional):
  - `timeout` (number): Connection timeout in ms (default: 5000)
  - `retries` (number): Max reconnection attempts (default: 10)

**Returns:**

- `CapnWebProvider`: React component to wrap your app
- `useCapnWeb`: Hook for making RPC calls with Suspense
- `useCapnWebApi`: Hook for direct API access

### `CapnWebProvider`

Provider component that manages the WebSocket connection lifecycle.

### `useCapnWeb<TResult>(fn, deps?)`

Hook that makes an RPC call and suspends until it completes.

**Parameters:**

- `fn`: Function that takes the API and returns a Promise
- `deps`: Dependency array (like `useEffect`)

**Returns:** The resolved value from the RPC call

### `useCapnWebApi()`

Hook that returns direct access to the RPC API.

**Returns:** `RpcStub<T>` - The typed RPC API stub

## License

MIT License - see [LICENSE](./LICENSE) for details.
