# Test Fixtures

This directory contains test fixtures for end-to-end browser testing of react-capnweb.

## Overview

The test infrastructure uses:
- **Deno** for test execution
- **Astral** (Puppeteer-like browser automation) for browser control
- **Multiple HTTP server IPs** to serve different test scenarios
- **Bundled React applications** as test fixtures

## Structure

```
test-fixtures/
├── README.md                    # This file
├── server-config.ts             # Server configuration (IP mappings)
├── dist/                        # Bundled test fixtures (gitignored)
├── websocket-demo.html          # WebSocket test fixture HTML
├── websocket-demo.tsx           # WebSocket test fixture React app
├── http-batch-demo.html         # HTTP Batch test fixture HTML
├── http-batch-demo.tsx          # HTTP Batch test fixture React app
├── message-port-demo.html       # MessagePort test fixture HTML
└── message-port-demo.tsx        # MessagePort test fixture React app
```

## Server Configuration

Test fixtures are served on different IP addresses to simulate different scenarios:

- **127.0.0.1** - WebSocket demo
- **127.0.0.2** - HTTP Batch demo
- **127.0.0.3** - MessagePort demo

### Ports

- **8080** - HTTP server (test fixtures)
- **8081** - WebSocket server (for WebSocket RPC)

## Running Tests

### Run all tests
```bash
deno task test
```

### Run only browser tests
```bash
deno task test:browser
```

### Start test server manually (for development)
```bash
deno task test:serve
```

Then open in browser:
- http://127.0.0.1:8080 - WebSocket demo
- http://127.0.0.2:8080 - HTTP Batch demo
- http://127.0.0.3:8080 - MessagePort demo

## Test Fixtures

### WebSocket Demo (`websocket-demo.tsx`)

Tests WebSocket transport features:
- ✅ Connection state tracking (`useConnectionState` hook)
- ✅ Connection status display (connecting, connected, reconnecting, etc.)
- ✅ RPC API calls (echo, getTimestamp, add)
- ✅ Concurrent RPC calls
- ✅ Manual connection close
- ✅ Connection callbacks (onConnected, onDisconnected, onReconnecting, onReconnectFailed)
- ✅ Suspense integration
- ✅ Automatic reconnection with exponential backoff

### HTTP Batch Demo (`http-batch-demo.tsx`)

Tests HTTP Batch transport features:
- ✅ RPC API calls over HTTP
- ✅ Sequential calls
- ✅ Concurrent calls (batching)
- ✅ Direct API usage (`useCapnWebApi`)
- ✅ Manual session close
- ✅ Error handling

### MessagePort Demo (`message-port-demo.tsx`)

Tests MessagePort transport features:
- ✅ Port status tracking
- ✅ RPC API calls over MessagePort
- ✅ Simulated worker communication (MessageChannel)
- ✅ Sequential and concurrent calls
- ✅ Direct API usage (`useCapnWebApi`)
- ✅ Manual port close

## Adding New Tests

To add a new test fixture:

1. **Create HTML file** (`test-fixtures/my-demo.html`)
   - Include basic page structure
   - Load bundled JS: `<script src="/dist/my-demo.js"></script>`

2. **Create TSX file** (`test-fixtures/my-demo.tsx`)
   - Import from parent directory: `import { initCapnWebSocket } from '../websocket.tsx'`
   - Create React components with `data-testid` attributes
   - Mount app to `#app` element

3. **Update server config** (`test-fixtures/server-config.ts`)
   - Add new IP constant (e.g., `MY_DEMO_IP = '127.0.0.4'`)
   - Add to `configMap`

4. **Add browser tests** (`react-capnweb.browser.test.ts`)
   - Use helper functions: `waitForElement`, `waitForText`, `waitForAttribute`
   - Test user interactions and state changes
   - Verify DOM elements and text content

## Helper Functions

### `waitForElement(page, selector, timeout?)`
Waits for an element to appear in the DOM.

### `waitForText(page, selector, expectedText, timeout?)`
Waits for an element to contain specific text.

### `waitForAttribute(page, selector, attribute, expectedValue, timeout?)`
Waits for an element's attribute to have a specific value.

### `setupErrorReporting(page)`
Sets up error listeners to capture page errors and console logs.

## Test Data Attributes

All test fixtures use `data-testid` attributes for reliable element selection:

```tsx
// Good - stable, semantic
<button data-testid="run-api-tests-btn">Run Tests</button>

// Avoid - fragile, implementation detail
<button className="btn-primary">Run Tests</button>
```

## WebSocket Server

The test server includes a WebSocket endpoint at `ws://127.0.0.1:8081` that:
- Accepts WebSocket connections
- Echoes back received messages (for basic testing)
- Can be extended for more complex RPC scenarios

## Debugging Tests

### View page content on failure
Tests automatically log page HTML when elements aren't found.

### Take screenshots
Failed tests save a screenshot to `error.png` in the project root.

### Run with verbose output
```bash
deno task test:browser --log-level=debug
```

### Test individual fixtures in browser
Start the test server and open fixtures manually in your browser for interactive debugging.

## Common Issues

### "Element not found" errors
- Check that `data-testid` attribute is correct
- Verify element is rendered (not conditionally hidden)
- Increase timeout if element takes time to appear

### WebSocket connection failures
- Ensure WebSocket server (port 8081) is running
- Check browser console for connection errors
- Verify no firewall blocking localhost connections

### Test timeouts
- Some operations (RPC calls, animations) may need longer timeouts
- Adjust timeout parameter in helper functions
- Consider adding explicit waits for async operations

## Contributing

When adding new features to react-capnweb:

1. ✅ Add corresponding test fixture components
2. ✅ Write browser tests covering the feature
3. ✅ Update this README with new test scenarios
4. ✅ Ensure all tests pass before committing

## CI/CD

Tests are designed to run in headless mode for CI environments:
```bash
deno task test  # Runs in headless browser
```

For local development with visible browser:
- Modify `launch({ headless: true })` to `launch({ headless: false })`
- Or set environment variable (if configured)