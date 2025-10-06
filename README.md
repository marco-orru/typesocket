# TypeSocket

> **Type-safe WebSocket communication for TypeScript**

TypeSocket is a complete ecosystem for building type-safe WebSocket applications with full compile-time and runtime validation. It provides both client and server implementations with comprehensive features like automatic reconnection, message queuing, heartbeat monitoring, and Zod schema validation.

---

## 🎯 Why TypeSocket?

Traditional WebSocket code lacks type safety and runtime validation:

```typescript
// ❌ Without TypeSocket
ws.send(JSON.stringify({ type: 'chat', message: 'hello' })); // Any typo = runtime error
ws.onmessage = (event) => {
  const data = JSON.parse(event.data); // type: any
  console.log(data.mesage); // Typo! No error until runtime
};
```

With TypeSocket, you get full type safety and validation:

```typescript
// ✅ With TypeSocket
client.sendMessage('chat', { message: 'hello' }); // ✓ Type-checked at compile time
client.on.message('chat', (data) => {
  console.log(data.message); // ✓ Fully typed, intellisense works
});
```

---

## 📦 Packages

TypeSocket is a monorepo with separate packages for different use cases:

### [@typesocket/client](./packages/client)

Type-safe WebSocket client with automatic reconnection, message queuing, and heartbeat monitoring.

```bash
npm install @typesocket/client
```

**Features:**
- ✅ Complete type safety with TypeScript
- 🔄 Automatic reconnection with exponential backoff
- 📦 Message queuing when disconnected
- 💓 Heartbeat monitoring for connection health
- 🎨 Fluent API with method chaining
- 📊 Comprehensive metrics and monitoring

[**Read the full client documentation →**](./packages/client)

---

### [@typesocket/server](./packages/server)

Type-safe WebSocket server with Zod validation and backend-agnostic adapter pattern.

```bash
npm install @typesocket/server zod
```

**Features:**
- ✅ Full type safety with compile-time validation
- 🛡️ Runtime validation with Zod schemas
- 🔌 Backend-agnostic (works with any WebSocket library)
- 💓 Automatic heartbeat responses
- 📡 Type-safe broadcasting and targeted messaging
- 🎯 Comprehensive error handling

[**Read the full server documentation →**](./packages/server)

---

### [@typesocket/adapter-uWebSockets](./packages/adapter-uWebSockets)

High-performance uWebSockets.js adapter for TypeSocket Server.

```bash
npm install @typesocket/adapter-uWebSockets uWebSockets.js
```

**Features:**
- ⚡ Blazing fast performance with uWebSockets.js
- 💪 Automatic backpressure handling
- 🔧 Extensive configuration options
- 📦 Zero-config with sensible defaults

[**Read the adapter documentation →**](./packages/adapter-uWebSockets)

---

## 🚀 Quick Start

### Client Example

```typescript
import TypeSocketClient from '@typesocket/client';
import type { TypeSocketApi } from '@typesocket/client';

// Define your API
interface ChatApi extends TypeSocketApi {
  messages: {
    chat: { duplex: { text: string; userId: number } };
    notification: { received: { message: string } };
  };
}

// Create client
const client = new TypeSocketClient<ChatApi>('ws://localhost:8080');

// Register handlers
client.on
  .connected(() => console.log('Connected!'))
  .on.message('chat', (data) => {
    console.log(`${data.userId}: ${data.text}`);
  })
  .on.message('notification', (data) => {
    console.log('Notification:', data.message);
  });

// Connect
client.connect();

// Send messages
client.sendMessage('chat', { text: 'Hello!', userId: 123 });
```

### Server Example

```typescript
import { App } from 'uWebSockets.js';
import { createUWebSocketsAdapter } from '@typesocket/adapter-uWebSockets';
import { createTypeSocketServerBuilder } from '@typesocket/server';
import { z } from 'zod';

// Define schemas with Zod
const chatSchema = z.object({
  text: z.string(),
  userId: z.number()
});

const notificationSchema = z.object({
  message: z.string()
});

// Create adapter
const app = App();
const adapter = createUWebSocketsAdapter(app, {
  path: '/ws',
  port: 8080
});

// Build server
const server = createTypeSocketServerBuilder()
  .addDuplex('chat', chatSchema)
  .addSendable('notification', notificationSchema)
  .build(adapter)
  .on.connected((conn) => {
    console.log(`Client ${conn.id} connected`);
    conn.send('notification', { message: 'Welcome!' });
  })
  .on.message('chat', (conn, data) => {
    console.log(`${data.userId}: ${data.text}`);
    conn.server.broadcast('chat', data, [conn.id]);
  });

// Start server
await server.start();
console.log('Server running on ws://localhost:8080/ws');
```

---

## 🎨 Key Features

### Complete Type Safety

**Client:**
```typescript
interface MyApi extends TypeSocketApi {
  messages: {
    chat: { duplex: { text: string } };
    ping: { sent: { timestamp: number } };
    pong: { received: { timestamp: number; rtt: number } };
  };
}

const client = new TypeSocketClient<MyApi>('ws://localhost:8080');

// ✓ Type-checked at compile time
client.sendMessage('chat', { text: 'Hello' });

// ✗ TypeScript error: 'ping' requires { timestamp: number }
client.sendMessage('ping', { text: 'Wrong' });

// ✗ TypeScript error: 'pong' is receive-only
client.sendMessage('pong', { timestamp: 123, rtt: 50 });
```

**Server:**
```typescript
const server = createTypeSocketServerBuilder()
  .addDuplex('chat', z.object({ text: z.string() }))
  .addReceivable('ping', z.object({ timestamp: z.number() }))
  .addSendable('pong', z.object({ timestamp: z.number(), rtt: z.number() }))
  .build(adapter);

// ✓ Automatically validated with Zod
server.on.message('ping', (conn, data) => {
  // data.timestamp is guaranteed to be a number
  const rtt = Date.now() - data.timestamp;
  conn.send('pong', { timestamp: data.timestamp, rtt });
});
```

### Message Direction Control

TypeSocket distinguishes between three types of messages:

1. **Duplex** - Can be sent and received by both sides with the same payload
2. **Sent** - Client can send, server receives (or vice versa)
3. **Received** - Client receives, server sends (or vice versa)

This prevents common bugs like trying to send a receive-only message.

### Runtime Validation

**Server automatically validates all messages with Zod:**
- Invalid incoming messages → Error response sent to client
- Invalid outgoing messages → Exception thrown on server
- All handlers receive validated, typed data

### Automatic Features

**Client:**
- 🔄 Exponential backoff reconnection
- 📦 Message queuing during disconnection
- 💓 Heartbeat with RTT measurement
- 📊 Comprehensive metrics

**Server:**
- 💓 Automatic pong responses to ping
- 🛡️ Validation error responses
- 📡 Efficient broadcasting
- 🔌 Backend-agnostic adapters

---

## 📚 Documentation

- [**Client Documentation**](./packages/client/README.md) - Full client API reference
- [**Server Documentation**](./packages/server/README.md) - Full server API reference
- [**uWebSockets Adapter**](./packages/adapter-uWebSockets/README.md) - Adapter documentation
- [**Type Tests**](./tests) - Comprehensive type safety tests

---

## 🏗️ Architecture

```
TypeSocket
├── @typesocket/client          # WebSocket client
├── @typesocket/server          # WebSocket server (core)
└── @typesocket/adapter-*       # Backend adapters
    └── adapter-uWebSockets     # uWebSockets.js adapter
```

### Adapter Pattern

The server uses an adapter pattern to work with any WebSocket backend:

```typescript
interface TypeSocketServerAdapter {
  onConnection(handler: (clientId: string) => void): void;
  onMessage(handler: (clientId: string, message: string) => void): void;
  send(clientId: string, message: string): void;
  broadcast(message: string, exclude?: string[]): void;
  // ... more methods
}
```

This makes TypeSocket Server compatible with:
- ✅ uWebSockets.js (official adapter available)
- ✅ ws (coming soon)
- ✅ Socket.IO (coming soon)
- ✅ Any custom WebSocket implementation

---

## 🎯 Use Cases

### Real-Time Chat
```typescript
// Client
client.sendMessage('chat', { text: 'Hello everyone!' });

// Server
server.on.message('chat', (conn, data) => {
  conn.server.broadcast('chat', data, [conn.id]);
});
```

### Live Notifications
```typescript
// Server
server.broadcast('notification', {
  message: 'New update available!',
  priority: 'high'
});

// Client
client.on.message('notification', (data) => {
  showNotification(data.message, data.priority);
});
```

### Multiplayer Games
```typescript
// Client
client.sendMessage('move', { x: 10, y: 20, playerId: 'abc' });

// Server validates and broadcasts
server.on.message('move', (conn, data) => {
  if (isValidMove(data)) {
    conn.server.broadcast('move', data);
  }
});
```

---

## 🛠️ Development

```bash
# Clone repository
git clone https://github.com/yourusername/typesocket.git
cd typesocket

# Install dependencies
yarn install

# Run type checks
yarn tsc --noEmit

# Run tests
yarn test
```

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

### Creating New Adapters

Want to create an adapter for a different WebSocket backend? Check out the [Adapter Development Guide](./docs/adapter-development.md).

---

## 📄 License

MIT © Marco Orru

---

## 🔗 Links

- [GitHub Repository](https://github.com/yourusername/typesocket)
- [Issue Tracker](https://github.com/yourusername/typesocket/issues)
- [NPM - @typesocket/client](https://www.npmjs.com/package/@typesocket/client)
- [NPM - @typesocket/server](https://www.npmjs.com/package/@typesocket/server)

---

Made with ❤️ for type-safe WebSocket communications
