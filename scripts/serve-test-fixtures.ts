#!/usr/bin/env deno run --allow-net --allow-read

import {
  configMap,
  DEFAULT_PORT,
  HTTP_BATCH_IP,
  MESSAGE_PORT_IP,
  WEBSOCKET_IP,
  WS_PORT,
} from '../test-fixtures/server-config.ts';
import {
  newHttpBatchRpcResponse,
  newWebSocketRpcSession,
  RpcTarget,
} from 'capnweb';

// Mock API implementation for testing
class TestApiImpl extends RpcTarget {
  echo(message: string): string {
    return message;
  }

  getTimestamp(): number {
    return Date.now();
  }

  add(a: number, b: number): number {
    return a + b;
  }

  getUserData(userId: string): { id: string; name: string } {
    return {
      id: userId,
      name: `User ${userId}`,
    };
  }
}

interface ServerInstance {
  server: Deno.HttpServer;
  port: number;
}

// Handle HTTP Batch RPC requests
async function handleRpcRequest(req: Request): Promise<Response> {
  try {
    // Use capnweb's newHttpBatchRpcResponse to handle the request
    const response = await newHttpBatchRpcResponse(req, new TestApiImpl());

    // Add CORS headers for testing
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return response;
  } catch (error) {
    console.error('RPC request error:', error);
    return new Response(
      JSON.stringify({
        error: String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

function createTestFixtureServer(port: number = DEFAULT_PORT): ServerInstance {
  const controller = new AbortController();

  const server = Deno.serve({
    port,
    hostname: '0.0.0.0', // Listen on all interfaces
    signal: controller.signal,
  }, async (req) => {
    const url = new URL(req.url);
    const host = req.headers.get('host')?.split(':')[0] || '127.0.0.1';

    console.log(
      `${
        new Date().toISOString()
      } - ${req.method} ${url.pathname} from ${host}`,
    );

    // Handle RPC requests
    if (url.pathname === '/api/rpc') {
      if (req.method === 'OPTIONS') {
        // Handle CORS preflight
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Test-Header',
          },
        });
      }
      if (req.method === 'POST') {
        return handleRpcRequest(req);
      }
    }

    // Serve bundled JavaScript files
    if (url.pathname.startsWith('/dist/')) {
      try {
        const filePath = `./test-fixtures${url.pathname}`;
        const content = await Deno.readTextFile(filePath);
        return new Response(content, {
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        });
      } catch (error) {
        console.error(`Failed to serve JS file ${url.pathname}:`, error);
        return new Response('File not found', { status: 404 });
      }
    }

    // Serve HTML files based on IP mapping
    const htmlFile = configMap[host as keyof typeof configMap];
    if (!htmlFile) {
      console.warn(`No configuration found for IP: ${host}`);
      return new Response('No test fixture configured for this IP', {
        status: 404,
      });
    }

    try {
      const content = await Deno.readTextFile(`./test-fixtures/${htmlFile}`);
      return new Response(content, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    } catch (error) {
      console.error(`Failed to serve HTML file ${htmlFile}:`, error);
      return new Response('Demo not found', { status: 404 });
    }
  });

  const serverInfo = server.addr as Deno.NetAddr;

  return {
    server,
    port: serverInfo.port,
  };
}

function createWebSocketServer(port: number = WS_PORT): ServerInstance {
  const controller = new AbortController();

  const server = Deno.serve({
    port,
    hostname: '0.0.0.0',
    signal: controller.signal,
  }, (req) => {
    const url = new URL(req.url);

    console.log(
      `${new Date().toISOString()} - WebSocket ${req.method} ${url.pathname}`,
    );

    // Handle WebSocket upgrade
    if (req.headers.get('upgrade') === 'websocket') {
      const { socket, response } = Deno.upgradeWebSocket(req);

      socket.onopen = () => {
        console.log('WebSocket connection opened');
        // Initialize capnweb RPC session with our test API
        try {
          newWebSocketRpcSession(socket, new TestApiImpl());
          console.log('Capnweb RPC session initialized');
        } catch (error) {
          console.error('Failed to initialize RPC session:', error);
        }
      };

      socket.onclose = () => {
        console.log('WebSocket connection closed');
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      return response;
    }

    return new Response('WebSocket endpoint', { status: 200 });
  });

  const serverInfo = server.addr as Deno.NetAddr;

  return {
    server,
    port: serverInfo.port,
  };
}

function printServerInfo(
  httpServer: ServerInstance,
  wsServer: ServerInstance,
) {
  console.log(`\n🚀 Test Fixture Servers started\n`);
  console.log('HTTP Server:');
  console.log(
    `  📄 websocket: http://${WEBSOCKET_IP}:${httpServer.port}`,
  );
  console.log(
    `  📄 http-batch: http://${HTTP_BATCH_IP}:${httpServer.port}`,
  );
  console.log(
    `  📄 message-port: http://${MESSAGE_PORT_IP}:${httpServer.port}`,
  );
  console.log(`\nWebSocket Server:`);
  console.log(`  🔌 ws://127.0.0.1:${wsServer.port}`);
  console.log('\nPress Ctrl+C to stop the servers\n');
}

async function main() {
  try {
    const httpServer = createTestFixtureServer();
    const wsServer = createWebSocketServer();
    printServerInfo(httpServer, wsServer);

    // Handle graceful shutdown
    const handleShutdown = () => {
      console.log('\n🛑 Shutting down servers...');
      Deno.exit(0);
    };

    // Listen for interrupt signals
    Deno.addSignalListener('SIGINT', handleShutdown);
    Deno.addSignalListener('SIGTERM', handleShutdown);

    // Keep the servers running
    await Promise.all([httpServer.server.finished, wsServer.server.finished]);
  } catch (error) {
    console.error('Failed to start servers:', error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
