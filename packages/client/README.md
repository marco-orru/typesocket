# TypeSocket

> **Type-safe WebSocket client with runtime validation, automatic reconnection, message queuing, and heartbeat monitoring.**

TypeSocket brings TypeScript's compile-time type safety to WebSocket communications, ensuring that your client and server speak the same language with full intellisense support.

## 📋 Table of Contents

- [Why TypeSocket?](#why-typesocket)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Defining Your API Schema](#defining-your-api-schema)
- [Client Usage](#client-usage)
- [Server Implementation](#server-implementation)
- [Configuration](#configuration)
- [Advanced Features](#advanced-features)
- [Complete Examples](#complete-examples)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)
- [TypeScript Tips](#typescript-tips)
- [Troubleshooting](#troubleshooting)

---

## Why TypeSocket?

WebSocket communication in TypeScript often lacks type safety. You send JSON strings and hope the server understands them. TypeSocket solves this by:

### ❌ Without TypeSocket
```typescript
// What message types exist? What's the payload structure?
ws.send(JSON.stringify({ type: 'chat', data: { text: 'hello' } }));

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data); // any type
  // Is msg.type 'notification' or 'notifcation'? (typo!)
  // What fields does msg.data have?
  if (msg.type === 'notification') {
    console.log(msg.data.message); // Runtime error if wrong!
  }
};
```

### ✅ With TypeSocket
```typescript
// Full type safety and intellisense!
client.sendMessage('chat', { text: 'hello', userId: 123 }); // ✓ Type-checked

client.on.message('notification', (data) => {
  // data is typed as { message: string; priority: 'low' | 'high' }
  console.log(data.message); // ✓ Intellisense works
  console.log(data.priority); // ✓ Only 'low' or 'high'
});
```

---

## Features

### 🎯 **Complete Type Safety**
- **Compile-time validation**: TypeScript ensures messages match your schema
- **Intellisense everywhere**: Auto-completion for message types and payloads
- **Message direction inference**: Separate types for sent vs received messages

### 🔄 **Automatic Reconnection**
- Exponential backoff with configurable delays
- Customizable retry limits
- Event hooks for monitoring reconnection attempts

### 📦 **Message Queuing**
- Queue messages when disconnected
- Automatic flushing on reconnect
- Configurable overflow strategies (drop oldest, drop newest, reject)

### 💓 **Heartbeat Monitoring**
- Automatic ping/pong with configurable intervals
- Connection health detection
- Optional timestamp support for RTT calculation

### 🎨 **Fluent API**
- Method chaining for clean, readable code
- Conditional methods based on configuration
- Type-safe event handlers

### 🛡️ **Built-in Error Handling**
- Categorized errors (parse, send, connection, validation)
- Detailed error information with timestamps
- Easy error handling with typed error objects

---

## Installation

```bash
npm install typesocket
```

```bash
yarn add typesocket
```

```bash
pnpm add typesocket
```

---

## Quick Start

### 1. Define Your API Schema

Create a TypeScript interface that defines all your WebSocket messages:

```typescript
import type { TypeSocketApi } from 'typesocket';

interface ChatApi extends TypeSocketApi {
  messages: {
    // Client can send and receive chat messages
    chat: { duplex: { text: string; userId: number } };

    // Server sends notifications to client
    notification: { received: { message: string; priority: 'low' | 'high' } };

    // Client sends typing status to server
    typing: { sent: { isTyping: boolean } };
  };
}
```

### 2. Create the Client

```typescript
import TypeSocketClient from 'typesocket';

const client = new TypeSocketClient<ChatApi>('ws://localhost:8080');

// Connect
client.connect();

// Listen for messages
client.on
  .connected(() => console.log('Connected!'))
  .on.message('notification', (data) => {
    // data is typed as { message: string; priority: 'low' | 'high' }
    console.log(`[${data.priority}] ${data.message}`);
  });

// Send messages
client.sendMessage('chat', { text: 'Hello!', userId: 123 });
client.sendMessage('typing', { isTyping: true });
```

### 3. Implement the Server

```typescript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString());

    if (message.type === 'chat') {
      // Echo the message back
      ws.send(JSON.stringify({
        type: 'chat',
        data: message.data
      }));
    }
  });

  // Send a notification
  ws.send(JSON.stringify({
    type: 'notification',
    data: { message: 'Welcome!', priority: 'high' }
  }));
});
```

---

## Core Concepts

### Message Directions

TypeSocket supports three message direction patterns:

#### 1. **Duplex Messages** (Bidirectional)
Both client and server can send/receive with the same payload type.

```typescript
interface MyApi extends TypeSocketApi {
  messages: {
    chat: { duplex: { text: string; userId: number } };
  };
}

// Client can send
client.sendMessage('chat', { text: 'hi', userId: 1 });

// Client can receive
client.on.message('chat', (data) => {
  // data: { text: string; userId: number }
});
```

#### 2. **Sent-Only Messages** (Client → Server)
Client can send, but cannot receive this message type.

```typescript
interface MyApi extends TypeSocketApi {
  messages: {
    userAction: { sent: { action: string; timestamp: number } };
  };
}

// ✓ Client can send
client.sendMessage('userAction', { action: 'click', timestamp: Date.now() });

// ✗ Client CANNOT receive (TypeScript error)
client.on.message('userAction', (data) => {}); // Error!
```

#### 3. **Received-Only Messages** (Server → Client)
Client can receive, but cannot send this message type.

```typescript
interface MyApi extends TypeSocketApi {
  messages: {
    serverUpdate: { received: { status: string; data: unknown } };
  };
}

// ✓ Client can receive
client.on.message('serverUpdate', (data) => {
  // data: { status: string; data: unknown }
});

// ✗ Client CANNOT send (TypeScript error)
client.sendMessage('serverUpdate', { status: 'ok', data: {} }); // Error!
```

#### 4. **Mixed Messages** (Different Payloads)
Different payload types for sending vs receiving.

```typescript
interface MyApi extends TypeSocketApi {
  messages: {
    request: {
      sent: { requestId: string };
      received: { requestId: string; result: 'success' | 'error'; details: string };
    };
  };
}

// Send: { requestId: string }
client.sendMessage('request', { requestId: 'req-123' });

// Receive: { requestId: string; result: ...; details: ... }
client.on.message('request', (data) => {
  console.log(data.result, data.details);
});
```

### Heartbeat System

Heartbeat keeps the connection alive and detects failures:

```typescript
interface MyApi extends TypeSocketApi {
  heartbeat: {
    ping: 'ping';              // Message type for ping
    pong: 'pong';              // Message type for pong
    hasTimestamp: true;        // Include timestamps for RTT calculation
  };
  messages: {
    // ... your messages
  };
}

const client = new TypeSocketClient<MyApi>('ws://localhost:8080', {
  heartbeat: {
    enabled: true,
    ping: 'ping',
    pong: 'pong',
    hasTimestamp: true,
    interval: 30000,           // Send ping every 30s
    timeout: 5000              // Expect pong within 5s
  }
});

client.on.pongReceived((timestamp, rtt) => {
  console.log(`Connection healthy. RTT: ${rtt}ms`);
});
```

### Type Inference

TypeSocket automatically infers types from your API definition:

```typescript
interface MyApi extends TypeSocketApi {
  heartbeat: {
    ping: 'heartbeat-ping';    // Specific literal type
    pong: 'heartbeat-pong';
    hasTimestamp: true;        // Must be true
  };
  messages: {
    chat: { duplex: { text: string } };
  };
}

const client = new TypeSocketClient<MyApi>('ws://localhost:8080', {
  heartbeat: {
    enabled: true,
    ping: 'heartbeat-ping',    // ✓ Must match API
    pong: 'heartbeat-pong',    // ✓ Must match API
    hasTimestamp: true         // ✓ Must be true
  }
});

// ✗ TypeScript errors:
// ping: 'wrong'              // Error: must be 'heartbeat-ping'
// pong: 'wrong'              // Error: must be 'heartbeat-pong'
// hasTimestamp: false        // Error: must be true
```

---

## Defining Your API Schema

Your API schema is a TypeScript interface that extends `TypeSocketApi`. It defines all message types, their payloads, and optional heartbeat configuration.

### Basic Structure

```typescript
import type { TypeSocketApi } from 'typesocket';

interface YourApi extends TypeSocketApi {
  // Optional: Heartbeat configuration
  heartbeat?: {
    ping: string;              // Ping message type
    pong: string;              // Pong message type
    hasTimestamp: boolean;     // Whether to include timestamps
  };

  // Required: All your message types
  messages: {
    [messageType: string]: MessageDirectionApi;
  };
}
```

### Example: Complete API Definition

```typescript
interface GameApi extends TypeSocketApi {
  heartbeat: {
    ping: 'ping';
    pong: 'pong';
    hasTimestamp: true;
  };

  messages: {
    // Player actions (client → server)
    move: { sent: { x: number; y: number; timestamp: number } };
    attack: { sent: { targetId: string; weaponId: string } };

    // Game state updates (server → client)
    gameState: {
      received: {
        players: Array<{ id: string; x: number; y: number; health: number }>;
        timestamp: number;
      };
    };

    // Chat (bidirectional)
    chat: { duplex: { playerId: string; message: string } };

    // Authentication (different send/receive)
    auth: {
      sent: { token: string };
      received: { success: boolean; playerId: string; error?: string };
    };
  };
}
```

### Complex Payload Types

You can use any TypeScript type in your payloads:

```typescript
// Type aliases for reusability
type User = {
  id: string;
  name: string;
  avatar?: string;
};

type MessagePriority = 'low' | 'medium' | 'high';

interface RichApi extends TypeSocketApi {
  messages: {
    // Nested objects
    userUpdate: {
      duplex: {
        user: User;
        metadata: {
          timestamp: number;
          version: string;
        };
      };
    };

    // Arrays
    userList: { received: { users: User[] } };

    // Union types
    event: {
      sent:
        | { type: 'click'; x: number; y: number }
        | { type: 'keypress'; key: string }
        | { type: 'scroll'; delta: number };
    };

    // Optional fields
    notification: {
      received: {
        message: string;
        priority: MessagePriority;
        link?: string;
        metadata?: Record<string, unknown>;
      };
    };

    // Generics and mapped types
    response: {
      received: {
        status: 'success' | 'error';
        data: unknown;
        errors?: Array<{ field: string; message: string }>;
      };
    };
  };
}
```

---

## Client Usage

### Creating a Client

```typescript
import TypeSocketClient from 'typesocket';

// Basic client (all features enabled by default)
const client = new TypeSocketClient<YourApi>('ws://localhost:8080');

// With custom configuration
const client = new TypeSocketClient<YourApi>('ws://localhost:8080', {
  reconnection: {
    enabled: true,
    maxRetries: 10,
    initialDelay: 1000,
    maxDelay: 30000,
    delayMultiplier: 2
  },
  messageQueue: {
    enabled: true,
    maxSize: 100,
    overflow: 'drop-oldest'  // or 'drop-newest' or 'reject'
  },
  heartbeat: {
    enabled: true,
    ping: 'ping',
    pong: 'pong',
    hasTimestamp: true,
    interval: 30000,
    timeout: 5000
  }
});
```

### Connecting and Disconnecting

```typescript
// Connect to server
client.connect();

// Disconnect (prevents automatic reconnection)
client.disconnect();

// Check connection state
import { TypeSocketConnectionState } from 'typesocket';

if (client.metrics.connectionState === TypeSocketConnectionState.CONNECTED) {
  console.log('Connected!');
}
```

### Sending Messages

```typescript
// Type-safe message sending
const success = client.sendMessage('chat', {
  text: 'Hello!',
  userId: 123
});

if (!success) {
  console.log('Message failed to send (queued if queue enabled)');
}

// TypeScript will error if:
// 1. Message type doesn't exist
// 2. Payload doesn't match the schema
// 3. Message is receive-only

// ✗ These will cause TypeScript errors:
client.sendMessage('wrongType', { ... });           // Error: unknown type
client.sendMessage('chat', { wrong: 'fields' });    // Error: wrong payload
client.sendMessage('serverUpdate', { ... });        // Error: receive-only
```

### Receiving Messages

```typescript
// Register message handlers
client.on.message('chat', (data) => {
  // data is fully typed based on your API
  console.log(`${data.userId}: ${data.text}`);
});

client.on.message('notification', (data) => {
  console.log(`[${data.priority}] ${data.message}`);
});

// Remove handlers
const handler = (data) => console.log(data);
client.on.message('chat', handler);
client.off.message('chat', handler);
```

### Event Handlers

TypeSocket provides comprehensive event handling:

```typescript
client.on
  // Connection events
  .connected(() => {
    console.log('WebSocket connected');
  })
  .on.disconnected((info) => {
    console.log(`Disconnected: ${info.reason} (code: ${info.code})`);
  })
  .on.error((error) => {
    console.error(`Error [${error.category}]: ${error.message}`);
    console.error('Occurred at:', error.timestamp);
    console.error('Connection state:', error.connectionState);
  })

  // Reconnection events (only if reconnection enabled)
  .on.beforeReconnect((info) => {
    console.log(`Reconnecting (attempt ${info.attempt}/${info.maxRetries})`);
    console.log(`Delay: ${info.delay}ms`);
  })

  // Queue events (only if queue enabled)
  .on.queueFull((info) => {
    console.warn(`Queue full! ${info.currentSize}/${info.maxSize}`);
    console.warn(`Overflow strategy: ${info.overflow}`);
  })

  // Heartbeat events (only if heartbeat enabled)
  .on.heartbeatTimeout(() => {
    console.error('Connection lost - no pong received');
  })
  .on.pingSent((timestamp) => {
    console.log('Ping sent at:', timestamp);
  })
  .on.pongReceived((timestamp, rtt) => {
    console.log(`Pong received! RTT: ${rtt}ms`);
  });
```

### Method Chaining

All event handlers return the client for fluent chaining:

```typescript
client
  .on.connected(() => console.log('Connected'))
  .on.disconnected(() => console.log('Disconnected'))
  .on.message('chat', (data) => console.log(data))
  .on.message('notification', (data) => console.log(data))
  .connect();
```

### Monitoring Metrics

```typescript
// Connection state
console.log(client.metrics.connectionState);

// Reconnection info
console.log(`Reconnection attempts: ${client.metrics.reconnectionAttempts}`);
console.log(`Is reconnecting: ${client.metrics.isReconnecting}`);

// Heartbeat info
console.log(`Last pong: ${client.metrics.lastPongReceived}`);
console.log(`Last RTT: ${client.metrics.lastRoundTripTime}ms`);

// Queue info
console.log(`Queue size: ${client.metrics.queueSize}`);
```

### Queue Management

When queue is enabled, you can inspect and control it:

```typescript
// Get queue size
console.log(`Queued messages: ${client.queue.size}`);

// Get all queued messages (readonly)
const messages = client.queue.messages;
console.log('Queued:', messages);

// Clear the queue
client.queue.clear();
```

### Reconnection Control

When reconnection is enabled, you can control it:

```typescript
// Check reconnection status
console.log(`Attempts: ${client.reconnection.attempts}`);
console.log(`Is reconnecting: ${client.reconnection.isReconnecting}`);

// Disable reconnection temporarily
client.reconnection.disable();

// Re-enable reconnection
client.reconnection.enable();
```

---

## Server Implementation

TypeSocket is a **client library**, but you can implement a type-safe server using the same API schema.

### Node.js with `ws`

```typescript
import { WebSocketServer, WebSocket } from 'ws';

// Use the same API schema as the client!
interface ChatApi extends TypeSocketApi {
  messages: {
    chat: { duplex: { text: string; userId: number } };
    notification: { received: { message: string; priority: 'low' | 'high' } };
    typing: { sent: { isTyping: boolean } };
  };
}

// Helper types for type-safe messaging
type SendableMessage<T extends TypeSocketApi> = {
  [K in keyof T['messages']]: T['messages'][K] extends { duplex: infer P }
    ? { type: K; data: P }
    : T['messages'][K] extends { received: infer P }
    ? { type: K; data: P }
    : never;
}[keyof T['messages']];

type ReceivableMessage<T extends TypeSocketApi> = {
  [K in keyof T['messages']]: T['messages'][K] extends { duplex: infer P }
    ? { type: K; data: P }
    : T['messages'][K] extends { sent: infer P }
    ? { type: K; data: P }
    : never;
}[keyof T['messages']];

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');

  // Type-safe send function
  function send<K extends keyof ChatApi['messages']>(
    type: K,
    data: ChatApi['messages'][K] extends { duplex: infer P }
      ? P
      : ChatApi['messages'][K] extends { received: infer P }
      ? P
      : never
  ) {
    ws.send(JSON.stringify({ type, data }));
  }

  // Send welcome notification
  send('notification', {
    message: 'Welcome to the chat!',
    priority: 'high'
  });

  // Handle incoming messages
  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as ReceivableMessage<ChatApi>;

      switch (message.type) {
        case 'chat':
          // Echo to all clients
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              send('chat', message.data);
            }
          });
          break;

        case 'typing':
          console.log('User typing:', message.data.isTyping);
          break;
      }
    } catch (error) {
      console.error('Invalid message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

console.log('Server running on ws://localhost:8080');
```

### Bun WebSocket Server

```typescript
import type { ServerWebSocket } from 'bun';

const server = Bun.serve({
  port: 8080,
  websocket: {
    open(ws: ServerWebSocket) {
      console.log('Client connected');

      // Send welcome
      ws.send(JSON.stringify({
        type: 'notification',
        data: { message: 'Welcome!', priority: 'high' }
      }));
    },

    message(ws: ServerWebSocket, message: string) {
      const msg = JSON.parse(message) as ReceivableMessage<ChatApi>;

      if (msg.type === 'chat') {
        // Broadcast to all
        server.publish('chat', JSON.stringify({
          type: 'chat',
          data: msg.data
        }));
      }
    },

    close(ws: ServerWebSocket) {
      console.log('Client disconnected');
    }
  },

  fetch(req, server) {
    if (server.upgrade(req)) {
      return; // WebSocket upgrade
    }
    return new Response('WebSocket server');
  }
});

console.log('Bun server running on ws://localhost:8080');
```

### Deno WebSocket Server

```typescript
// @deno-types="npm:ws@^8"
import { WebSocketServer } from 'npm:ws@^8';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  // Same as Node.js example above
  ws.send(JSON.stringify({
    type: 'notification',
    data: { message: 'Welcome!', priority: 'high' }
  }));

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    console.log('Received:', msg);
  });
});

console.log('Deno server running on ws://localhost:8080');
```

### Heartbeat Implementation (Server)

To support heartbeat, the server must respond to ping messages:

```typescript
ws.on('message', (raw) => {
  const message = JSON.parse(raw.toString());

  // Handle heartbeat ping
  if (message.type === 'ping') {
    // Echo back as pong
    ws.send(JSON.stringify({
      type: 'pong',
      data: message.data  // Include timestamp if hasTimestamp: true
    }));
    return;
  }

  // Handle other messages...
});
```

### Server-Side Type Safety Helper

Create a reusable typed WebSocket wrapper:

```typescript
class TypedWebSocket<T extends TypeSocketApi> {
  constructor(private ws: WebSocket) {}

  send<K extends keyof T['messages']>(
    type: K,
    data: T['messages'][K] extends { duplex: infer P }
      ? P
      : T['messages'][K] extends { received: infer P }
      ? P
      : never
  ): void {
    this.ws.send(JSON.stringify({ type, data }));
  }

  onMessage(
    callback: (message: ReceivableMessage<T>) => void
  ): void {
    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        callback(msg as ReceivableMessage<T>);
      } catch (error) {
        console.error('Parse error:', error);
      }
    });
  }
}

// Usage
const typedWs = new TypedWebSocket<ChatApi>(ws);
typedWs.send('notification', { message: 'Hi', priority: 'low' });
typedWs.onMessage((msg) => {
  // msg is typed!
  if (msg.type === 'chat') {
    console.log(msg.data.text);
  }
});
```

---

## Configuration

### Reconnection Configuration

```typescript
const client = new TypeSocketClient<YourApi>('ws://localhost:8080', {
  reconnection: {
    enabled: true,              // Enable auto-reconnection (default: true)
    maxRetries: Infinity,       // Max reconnection attempts (default: Infinity)
    initialDelay: 1000,         // Initial delay in ms (default: 1000)
    maxDelay: 30000,            // Max delay in ms (default: 30000)
    delayMultiplier: 2          // Exponential backoff multiplier (default: 2)
  }
});

// Delay calculation: min(initialDelay * (delayMultiplier ^ attempt), maxDelay)
// Attempt 1: 1000ms
// Attempt 2: 2000ms
// Attempt 3: 4000ms
// Attempt 4: 8000ms
// ...
// Attempt 10+: 30000ms (capped at maxDelay)
```

### Message Queue Configuration

```typescript
const client = new TypeSocketClient<YourApi>('ws://localhost:8080', {
  messageQueue: {
    enabled: true,              // Enable message queuing (default: true)
    maxSize: 100,               // Max queued messages (default: 100)
    overflow: 'drop-oldest'     // What to do when full (default: 'drop-oldest')
    // Options: 'drop-oldest' | 'drop-newest' | 'reject'
  }
});

// Overflow strategies:
// - 'drop-oldest': Remove oldest message, add new one
// - 'drop-newest': Reject new message, keep old ones
// - 'reject': Reject new message, emit queueFull event
```

### Heartbeat Configuration

```typescript
interface YourApi extends TypeSocketApi {
  heartbeat: {
    ping: 'ping';
    pong: 'pong';
    hasTimestamp: true;
  };
  messages: { /* ... */ };
}

const client = new TypeSocketClient<YourApi>('ws://localhost:8080', {
  heartbeat: {
    enabled: true,              // Enable heartbeat (default: false)
    ping: 'ping',               // Ping message type (must match API)
    pong: 'pong',               // Pong message type (must match API)
    hasTimestamp: true,         // Include timestamps (must match API)
    interval: 30000,            // Send ping every 30s (default: 30000)
    timeout: 5000               // Expect pong within 5s (default: 5000)
  }
});

// TypeScript will error if ping/pong/hasTimestamp don't match the API!
```

### Conditional Features

Some client features are only available based on configuration:

```typescript
// Queue disabled - queue property and queueFull handler unavailable
const client1 = new TypeSocketClient<
  YourApi,
  { messageQueue: { enabled: false } }
>('ws://localhost:8080', {
  messageQueue: { enabled: false }
});

client1.queue.size;              // ✗ TypeScript error
client1.on.queueFull(() => {});  // ✗ TypeScript error

// Reconnection disabled - reconnection property and beforeReconnect handler unavailable
const client2 = new TypeSocketClient<
  YourApi,
  { reconnection: { enabled: false } }
>('ws://localhost:8080', {
  reconnection: { enabled: false }
});

client2.reconnection.attempts;        // ✗ TypeScript error
client2.on.beforeReconnect(() => {}); // ✗ TypeScript error

// Heartbeat disabled - heartbeat handlers unavailable
const client3 = new TypeSocketClient<YourApi>('ws://localhost:8080');
// heartbeat defaults to disabled

client3.on.heartbeatTimeout(() => {}); // ✗ TypeScript error
client3.on.pingSent(() => {});         // ✗ TypeScript error
client3.on.pongReceived(() => {});     // ✗ TypeScript error
```

---

## Advanced Features

### Error Handling

TypeSocket provides detailed error information:

```typescript
client.on.error((error) => {
  console.error('Error category:', error.category);
  // 'parse' | 'send' | 'connection' | 'validation'

  console.error('Message:', error.message);
  console.error('Timestamp:', error.timestamp);
  console.error('Connection state:', error.connectionState);

  // Original error (if available)
  if (error.originalError) {
    console.error('Original error:', error.originalError);
  }

  // Original data that caused the error
  if (error.originalData) {
    console.error('Original data:', error.originalData);
  }

  // Handle different error types
  switch (error.category) {
    case 'parse':
      console.error('Failed to parse message');
      break;
    case 'send':
      console.error('Failed to send message');
      break;
    case 'connection':
      console.error('Connection error');
      break;
    case 'validation':
      console.error('Message validation failed');
      break;
  }
});
```

### Custom Validation

Add runtime validation to your messages:

```typescript
import { z } from 'zod';

// Define schemas
const chatSchema = z.object({
  text: z.string().min(1).max(500),
  userId: z.number().positive()
});

// Validate before sending
function sendChat(text: string, userId: number) {
  const result = chatSchema.safeParse({ text, userId });

  if (!result.success) {
    console.error('Validation failed:', result.error);
    return false;
  }

  return client.sendMessage('chat', result.data);
}

// Validate received messages
client.on.message('chat', (data) => {
  const result = chatSchema.safeParse(data);

  if (!result.success) {
    console.error('Invalid message received:', result.error);
    return;
  }

  // data is validated
  console.log(result.data.text);
});
```

---

## Complete Examples

### Example: Real-Time Chat Application

**Shared types** (`types.ts`):
```typescript
import type { TypeSocketApi } from 'typesocket';

export interface ChatApi extends TypeSocketApi {
  heartbeat: {
    ping: 'ping';
    pong: 'pong';
    hasTimestamp: true;
  };

  messages: {
    // Chat messages
    chat: {
      duplex: {
        username: string;
        message: string;
        timestamp: number;
      };
    };

    // Typing indicator
    typing: { sent: { username: string; isTyping: boolean } };

    // User list
    userList: {
      received: {
        users: Array<{ username: string; joinedAt: number }>;
      };
    };
  };
}
```

**Client** (`client.ts`):
```typescript
import TypeSocketClient from 'typesocket';
import type { ChatApi } from './types';

const client = new TypeSocketClient<ChatApi>('ws://localhost:8080', {
  heartbeat: {
    enabled: true,
    ping: 'ping',
    pong: 'pong',
    hasTimestamp: true
  }
});

client.on
  .connected(() => console.log('Connected!'))
  .on.message('chat', (data) => {
    console.log(`[${new Date(data.timestamp).toLocaleTimeString()}] ${data.username}: ${data.message}`);
  })
  .on.message('userList', (data) => {
    console.log('Users online:', data.users.map(u => u.username).join(', '));
  });

client.connect();

// Send a message
client.sendMessage('chat', {
  username: 'Alice',
  message: 'Hello!',
  timestamp: Date.now()
});
```

**Server** (`server.ts`):
```typescript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', data: msg.data }));
    } else if (msg.type === 'chat') {
      // Broadcast to all
      wss.clients.forEach((client) => {
        client.send(raw.toString());
      });
    }
  });
});
```

---

## API Reference

### TypeSocketClient Class

#### Constructor
```typescript
new TypeSocketClient<T extends TypeSocketApi, C extends TypeSocketClientConfig<T>>(
  url: URL | string,
  config?: C
)
```

#### Properties
- `on: OnHandlers<T, C>` - Event handler registration
- `off: OffHandlers<T, C>` - Event handler removal
- `queue: QueueManager<T>` - Queue manager (if enabled)
- `reconnection: ReconnectionManager<T>` - Reconnection manager (if enabled)
- `metrics: MetricsManager<T>` - Client metrics

#### Methods
- `connect(): void` - Connect to WebSocket server
- `disconnect(reset?: true): void` - Disconnect from server
- `sendMessage<K>(type: K, data: ...): boolean` - Send a message
- `connectionState: TypeSocketConnectionState` - Current connection state

### Event Handlers

#### Always Available
- `on.connected(handler: () => void)` - Connection established
- `on.disconnected(handler: (info: DisconnectInfo) => void)` - Connection closed
- `on.error(handler: (error: TypeSocketError) => void)` - Error occurred
- `on.message<K>(type: K, handler: (data: ...) => void)` - Message received

#### Conditional Handlers
- `on.beforeReconnect(handler: (info: ReconnectAttemptInfo) => void)` - Before reconnection (reconnection enabled)
- `on.queueFull(handler: (info: QueueFullInfo) => void)` - Queue full (queue enabled)
- `on.heartbeatTimeout(handler: () => void)` - Heartbeat timeout (heartbeat enabled)
- `on.pingSent(handler: (timestamp?: number) => void)` - Ping sent (heartbeat enabled)
- `on.pongReceived(handler: (timestamp?: number, rtt?: number) => void)` - Pong received (heartbeat enabled)

---

## Best Practices

### 1. Define Shared Types

Keep your API definition in a shared file that both client and server import.

### 2. Use Specific Message Types

Prefer specific message types over generic ones for better type safety.

### 3. Enable Heartbeat in Production

Always use heartbeat to detect connection issues in production.

### 4. Monitor Queue Size

Watch for queue buildup which indicates connection or throughput issues.

### 5. Graceful Disconnect

Always disconnect gracefully when closing the application.

---

## TypeScript Tips

### Extracting Types from API

```typescript
import type { ExtractSendableMessageTypes, ExtractReceivedPayloadType } from 'typesocket';

type SendableTypes = ExtractSendableMessageTypes<YourApi>;
type ChatPayload = ExtractReceivedPayloadType<YourApi, 'chat'>;
```

---

## Troubleshooting

### TypeScript Errors

**"Property 'queue' does not exist on type 'never'"**

You're accessing `queue` when it's disabled. Enable it in config or remove the code.

**"Cannot call method 'beforeReconnect'"**

The method requires reconnection to be enabled in config.

### Runtime Issues

**Messages Not Sending**

1. Check connection state: `client.metrics.connectionState`
2. Listen for errors: `client.on.error(...)`
3. Verify server is running

**Connection Keeps Dropping**

1. Enable heartbeat to detect issues
2. Check network stability
3. Verify server responds to pings

---

## License

MIT

---

Made with ❤️ for type-safe WebSocket communications
