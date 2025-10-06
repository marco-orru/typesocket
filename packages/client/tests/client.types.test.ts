/**
 * Type Safety Tests for TypeSocketClient
 *
 * This file tests compile-time type inference and intellisense.
 * If this file compiles without errors, all type safety checks pass.
 *
 * Each @ts-expect-error comment indicates a line that SHOULD fail compilation.
 * If those lines compile successfully, the test has failed.
 */

import TypeSocketClient from '../src/client.js';
import type { TypeSocketApi, TypeSocketClientConfig } from '../src/types.js';

// ============================================================================
// Test API Definitions
// ============================================================================

/**
 * Complete API with all features: duplex, sent-only, received-only, heartbeat
 */
interface CompleteApi extends TypeSocketApi {
	heartbeat: {
		ping: 'heartbeat-ping';
		pong: 'heartbeat-pong';
		hasTimestamp: true;
	};
	messages: {
		// Duplex: can send and receive with same payload
		chat: { duplex: { text: string; userId: number } };
		notification: { duplex: { message: string; priority: 'low' | 'high' } };

		// Sent-only: client can send, server cannot send back
		userAction: { sent: { action: string; timestamp: number } };

		// Received-only: server can send, client cannot send
		serverUpdate: { received: { status: string; data: unknown } };

		// Mixed: different payloads for send vs receive
		status: {
			sent: { requestId: string };
			received: { requestId: string; result: 'success' | 'error'; details: string };
		};
	};
}

/**
 * API without heartbeat
 */
interface NoHeartbeatApi extends TypeSocketApi {
	messages: {
		simple: { duplex: { value: number } };
	};
}

/**
 * API with heartbeat but no timestamp
 */
interface HeartbeatNoTimestampApi extends TypeSocketApi {
	heartbeat: {
		ping: 'ping';
		pong: 'pong';
		hasTimestamp: false;
	};
	messages: {
		data: { duplex: { content: string } };
	};
}

// ============================================================================
// Test 1: Message Type Inference - Sendable Messages
// ============================================================================

function testSendableMessageTypes() {
	const client = new TypeSocketClient<CompleteApi>('ws://localhost:8080');

	// ✓ Should allow sending duplex messages
	client.sendMessage('chat', { text: 'A', userId: 12 });
	client.sendMessage('notification', { message: 'alert', priority: 'high' });

	// ✓ Should allow sending sent-only messages
	client.sendMessage('userAction', { action: 'click', timestamp: Date.now() });

	// ✓ Should allow sending mixed messages (with sent payload)
	client.sendMessage('status', { requestId: 'req-123' });

	// ✗ Should NOT allow sending received-only messages
	// @ts-expect-error - serverUpdate is received-only
	client.sendMessage('serverUpdate', { status: 'ok', data: {} });

	// ✗ Should NOT allow sending non-existent message types
	// @ts-expect-error - nonexistent is not a valid message type
	client.sendMessage('nonexistent', { foo: 'bar' });
}

// ============================================================================
// Test 2: Message Type Inference - Receivable Messages
// ============================================================================

function testReceivableMessageTypes() {
	const client = new TypeSocketClient<CompleteApi>('ws://localhost:8080');

	// ✓ Should allow receiving duplex messages
	client.on.message('chat', (data) => {
		const text: string = data.text;
		const userId: number = data.userId;
		// @ts-expect-error - wrong property type
		const wrong: boolean = data.text;
	});

	client.on.message('notification', (data) => {
		const msg: string = data.message;
		const priority: 'low' | 'high' = data.priority;
		// @ts-expect-error - priority cannot be 'medium'
		const wrong: 'medium' = data.priority;
	});

	// ✓ Should allow receiving received-only messages
	client.on.message('serverUpdate', (data) => {
		const status: string = data.status;
		const unknownData: unknown = data.data;
	});

	// ✓ Should allow receiving mixed messages (with received payload)
	client.on.message('status', (data) => {
		const reqId: string = data.requestId;
		const result: 'success' | 'error' = data.result;
		const details: string = data.details;
		// @ts-expect-error - sent payload properties not available in received handler
		const wrong = data.timestamp;
	});

	// ✗ Should NOT allow receiving sent-only messages
	// @ts-expect-error - userAction is sent-only
	client.on.message('userAction', (data) => {});

	// ✗ Should NOT allow receiving non-existent message types
	// @ts-expect-error - nonexistent is not a valid message type
	client.on.message('nonexistent', (data) => {});
}

// ============================================================================
// Test 3: Payload Type Validation - Sent Messages
// ============================================================================

function testSentPayloadTypes() {
	const client = new TypeSocketClient<CompleteApi>('ws://localhost:8080');

	// ✓ Correct payload structure
	client.sendMessage('chat', { text: 'hi', userId: 1 });

	// ✗ Missing required fields
	// @ts-expect-error - missing userId
	client.sendMessage('chat', { text: 'hi' });

	// ✗ Wrong field types
	// @ts-expect-error - userId must be number
	client.sendMessage('chat', { text: 'hi', userId: '1' });

	// ✗ Extra fields not allowed (strict typing)
	// @ts-expect-error - extra field not in type
	client.sendMessage('chat', { text: 'hi', userId: 1, extra: 'nope' });

	// ✓ Correct enum values
	client.sendMessage('notification', { message: 'test', priority: 'low' });
	client.sendMessage('notification', { message: 'test', priority: 'high' });

	// ✗ Invalid enum values
	// @ts-expect-error - priority must be 'low' or 'high'
	client.sendMessage('notification', { message: 'test', priority: 'medium' });
}

// ============================================================================
// Test 4: Payload Type Validation - Received Messages
// ============================================================================

function testReceivedPayloadTypes() {
	const client = new TypeSocketClient<CompleteApi>('ws://localhost:8080');

	client.on.message('status', (data) => {
		// ✓ All required fields present
		const reqId: string = data.requestId;
		const result: 'success' | 'error' = data.result;
		const details: string = data.details;

		// ✗ Cannot assign wrong types
		// @ts-expect-error - result is not a boolean
		const wrongType: boolean = data.result;

		// ✗ Cannot access non-existent fields
		// @ts-expect-error - noSuchField doesn't exist
		const noField = data.noSuchField;
	});
}

// ============================================================================
// Test 5: Heartbeat Configuration Type Inference
// ============================================================================

function testHeartbeatConfigInference() {
	// ✓ With heartbeat defined in API
	const configComplete: TypeSocketClientConfig<CompleteApi> = {
		heartbeat: {
			enabled: true,
			interval: 30000,
			timeout: 5000,
			ping: 'heartbeat-ping', // ✓ Must match API definition
			pong: 'heartbeat-pong', // ✓ Must match API definition
			hasTimestamp: true, // ✓ Must match API definition
		},
	};

	// ✗ Wrong ping type
	const wrongPing: TypeSocketClientConfig<CompleteApi> = {
		heartbeat: {
			enabled: true,
			// @ts-expect-error - ping must be 'heartbeat-ping'
			ping: 'wrong-ping',
			pong: 'heartbeat-pong',
			hasTimestamp: true,
		},
	};

	// ✗ Wrong pong type
	const wrongPong: TypeSocketClientConfig<CompleteApi> = {
		heartbeat: {
			enabled: true,
			ping: 'heartbeat-ping',
			// @ts-expect-error - pong must be 'heartbeat-pong'
			pong: 'wrong-pong',
			hasTimestamp: true,
		},
	};

	// ✗ Wrong hasTimestamp type
	const wrongTimestamp: TypeSocketClientConfig<CompleteApi> = {
		heartbeat: {
			enabled: true,
			ping: 'heartbeat-ping',
			pong: 'heartbeat-pong',
			// @ts-expect-error - hasTimestamp must be true
			hasTimestamp: false,
		},
	};

	// ✓ No heartbeat API - ping/pong default to string
	const noHeartbeat: TypeSocketClientConfig<NoHeartbeatApi> = {
		heartbeat: {
			enabled: true,
			ping: 'any-string-works',
			pong: 'another-string',
			hasTimestamp: true, // Can be any boolean
		},
	};

	// ✓ Heartbeat without timestamp
	const noTimestamp: TypeSocketClientConfig<HeartbeatNoTimestampApi> = {
		heartbeat: {
			enabled: true,
			ping: 'ping',
			pong: 'pong',
			// @ts-expect-error - hasTimestamp must be false
			hasTimestamp: true,
		},
	};

	const noTimestampCorrect: TypeSocketClientConfig<HeartbeatNoTimestampApi> = {
		heartbeat: {
			enabled: true,
			ping: 'ping',
			pong: 'pong',
			hasTimestamp: false,
		},
	};
}

// ============================================================================
// Test 6: Event Handler Type Inference
// ============================================================================

function testEventHandlerTypes() {
	const client = new TypeSocketClient<CompleteApi>('ws://localhost:8080');

	// ✓ connected handler - no parameters
	client.on.connected(() => {
		console.log('connected');
	});

	// ✗ connected handler - should not accept parameters
	// @ts-expect-error - connected handler takes no parameters
	client.on.connected((param) => {});

	// ✓ disconnected handler - takes DisconnectInfo
	client.on.disconnected((info) => {
		const code: number = info.code;
		const reason: string = info.reason;
		const wasClean: boolean = info.wasClean;
	});

	// ✗ disconnected handler - wrong parameter type
	// @ts-expect-error - parameter must be DisconnectInfo
	client.on.disconnected((info: string) => {});

	// ✓ error handler - takes TypeSocketError
	client.on.error((error) => {
		const category: 'parse' | 'send' | 'connection' | 'validation' = error.category;
		const message: string = error.message;
		const timestamp: Date = error.timestamp;
	});

	// ✓ message handler - correct message type and payload
	client.on.message('chat', (data) => {
		const text: string = data.text;
		const userId: number = data.userId;
	});
}

// ============================================================================
// Test 7: Conditional Features - Queue Enabled/Disabled
// ============================================================================

function testQueueConditionalTypes() {
	// ✓ Queue enabled (default) - must explicitly type the config for strict typing
	const clientQueueEnabled = new TypeSocketClient<CompleteApi, { messageQueue: { enabled: true } }>('ws://localhost:8080', {
		messageQueue: { enabled: true },
	});

	// Queue manager should be accessible
	const queueSize: number = clientQueueEnabled.queue.size;
	clientQueueEnabled.queue.clear();

	// ✓ Queue disabled - must explicitly type the config for strict typing
	const clientQueueDisabled = new TypeSocketClient<CompleteApi, { messageQueue: { enabled: false } }>('ws://localhost:8080', {
		messageQueue: { enabled: false },
	});

	// @ts-expect-error - queue should not be accessible when disabled
	const noQueue = clientQueueDisabled.queue.size;

	// ✓ queueFull handler only available when queue enabled
	clientQueueEnabled.on.queueFull((info) => {
		const size: number = info.currentSize;
	});

	// @ts-expect-error - queueFull handler not available when queue disabled
	clientQueueDisabled.on.queueFull((info) => {});
}

// ============================================================================
// Test 8: Conditional Features - Reconnection Enabled/Disabled
// ============================================================================

function testReconnectionConditionalTypes() {
	// ✓ Reconnection enabled - must explicitly type the config for strict typing
	const clientReconnectEnabled = new TypeSocketClient<CompleteApi, { reconnection: { enabled: true } }>('ws://localhost:8080', {
		reconnection: { enabled: true },
	});

	// Reconnection manager should be accessible
	const attempts: number = clientReconnectEnabled.reconnection.attempts;
	clientReconnectEnabled.reconnection.disable();

	// ✓ Reconnection disabled - must explicitly type the config for strict typing
	const clientReconnectDisabled = new TypeSocketClient<CompleteApi, { reconnection: { enabled: false } }>('ws://localhost:8080', {
		reconnection: { enabled: false },
	});

	// @ts-expect-error - reconnection should not be accessible when disabled
	const noReconnect = clientReconnectDisabled.reconnection.attempts;

	// ✓ beforeReconnect handler only available when reconnection enabled
	clientReconnectEnabled.on.beforeReconnect((info) => {
		const attempt: number = info.attempt;
	});

	// @ts-expect-error - beforeReconnect handler not available when reconnection disabled
	clientReconnectDisabled.on.beforeReconnect((info) => {});
}

// ============================================================================
// Test 9: Conditional Features - Heartbeat Enabled/Disabled
// ============================================================================

function testHeartbeatConditionalTypes() {
	// ✓ Heartbeat enabled - must explicitly type the config for strict typing
	const clientHeartbeatEnabled = new TypeSocketClient<CompleteApi, { heartbeat: { enabled: true; ping: 'heartbeat-ping'; pong: 'heartbeat-pong'; hasTimestamp: true } }>(
		'ws://localhost:8080',
		{
			heartbeat: {
				enabled: true,
				ping: 'heartbeat-ping',
				pong: 'heartbeat-pong',
				hasTimestamp: true,
			},
		},
	);

	// ✓ Heartbeat handlers available
	clientHeartbeatEnabled.on.heartbeatTimeout(() => {});
	clientHeartbeatEnabled.on.pingSent((timestamp) => {
		const ts: number | undefined = timestamp;
	});
	clientHeartbeatEnabled.on.pongReceived((timestamp, rtt) => {
		const ts: number | undefined = timestamp;
		const roundTrip: number | undefined = rtt;
	});

	// ✓ Heartbeat disabled - must explicitly type the config for strict typing
	const clientHeartbeatDisabled = new TypeSocketClient<CompleteApi, { heartbeat: { enabled: false } }>('ws://localhost:8080', {
		heartbeat: { enabled: false },
	});

	// @ts-expect-error - heartbeatTimeout not available when heartbeat disabled
	clientHeartbeatDisabled.on.heartbeatTimeout(() => {});

	// @ts-expect-error - pingSent not available when heartbeat disabled
	clientHeartbeatDisabled.on.pingSent((timestamp) => {});

	// @ts-expect-error - pongReceived not available when heartbeat disabled
	clientHeartbeatDisabled.on.pongReceived((timestamp, rtt) => {});
}

// ============================================================================
// Test 10: Method Chaining
// ============================================================================

function testMethodChaining() {
	const client = new TypeSocketClient<CompleteApi>('ws://localhost:8080');

	// ✓ All on handlers should return the client for chaining
	client.on
		.connected(() => {})
		.on.disconnected((info) => {})
		.on.error((error) => {})
		.on.message('chat', (data) => {})
		.on.message('notification', (data) => {})
		.connect();

	// ✓ All off handlers should return the client for chaining
	const handler = () => {};
	client.off
		.connected(handler)
		.off.disconnected(() => {})
		.disconnect();
}

// ============================================================================
// Test 11: Metrics Type Safety
// ============================================================================

function testMetricsTypes() {
	const client = new TypeSocketClient<CompleteApi>('ws://localhost:8080');

	// ✓ All metrics should have correct types
	const state: import('../src/types.js').TypeSocketConnectionState = client.metrics.connectionState;
	const attempts: number = client.metrics.reconnectionAttempts;
	const isReconnecting: boolean = client.metrics.isReconnecting;
	const lastPong: Date | null = client.metrics.lastPongReceived;
	const lastRtt: number | null = client.metrics.lastRoundTripTime;
	const queueSize: number = client.metrics.queueSize;

	// Verify types are correctly enforced
	console.log(state, attempts, isReconnecting, lastPong, lastRtt, queueSize);
}

// ============================================================================
// Test 12: Complex Message Types
// ============================================================================

interface ComplexTypesApi extends TypeSocketApi {
	messages: {
		// Nested objects
		complexData: {
			duplex: {
				user: {
					id: number;
					profile: {
						name: string;
						email: string;
						settings: {
							theme: 'light' | 'dark';
							notifications: boolean;
						};
					};
				};
				metadata: {
					timestamp: number;
					version: string;
				};
			};
		};

		// Arrays
		userList: { received: { users: Array<{ id: number; name: string }> } };

		// Union types
		event: {
			sent: { type: 'click'; x: number; y: number } | { type: 'keypress'; key: string } | { type: 'scroll'; delta: number };
		};

		// Optional fields
		optional: { duplex: { required: string; optional?: number } };
	};
}

function testComplexMessageTypes() {
	const client = new TypeSocketClient<ComplexTypesApi>('ws://localhost:8080');

	// ✓ Nested object structure
	client.sendMessage('complexData', {
		user: {
			id: 1,
			profile: {
				name: 'John',
				email: 'john@example.com',
				settings: {
					theme: 'dark',
					notifications: true,
				},
			},
		},
		metadata: {
			timestamp: Date.now(),
			version: '1.0',
		},
	});

	// ✗ Missing nested field - should error
	client.sendMessage('complexData', {
		user: {
			id: 1,
			profile: {
				name: 'John',
				email: 'john@example.com',
				// @ts-expect-error - missing settings.notifications field
				settings: {
					theme: 'dark',
				},
			},
		},
		metadata: { timestamp: Date.now(), version: '1.0' },
	});

	// ✓ Array types
	client.on.message('userList', (data) => {
		data.users.forEach((user) => {
			const id: number = user.id;
			const name: string = user.name;
		});
	});

	// ✓ Union types - all variants
	client.sendMessage('event', { type: 'click', x: 10, y: 20 });
	client.sendMessage('event', { type: 'keypress', key: 'Enter' });
	client.sendMessage('event', { type: 'scroll', delta: 100 });

	// ✗ Invalid union variant
	// @ts-expect-error - invalid type
	client.sendMessage('event', { type: 'invalid', data: 'nope' });

	// ✗ Missing required field in union variant
	// @ts-expect-error - missing x and y for click
	client.sendMessage('event', { type: 'click' });

	// ✓ Optional fields
	client.sendMessage('optional', { required: 'yes' });
	client.sendMessage('optional', { required: 'yes', optional: 42 });

	// ✗ Missing required field
	// @ts-expect-error - missing required
	client.sendMessage('optional', { optional: 42 });
}

// ============================================================================
// Test 13: Constructor Overloads and Config Inference
// ============================================================================

function testConstructorTypes() {
	// ✓ With full config
	const client1 = new TypeSocketClient<CompleteApi>('ws://localhost:8080', {
		reconnection: { enabled: true, maxRetries: 5 },
		messageQueue: { enabled: true, maxSize: 100 },
		heartbeat: {
			enabled: true,
			ping: 'heartbeat-ping',
			pong: 'heartbeat-pong',
			hasTimestamp: true,
		},
	});

	// ✓ With partial config
	const client2 = new TypeSocketClient<CompleteApi>('ws://localhost:8080', {
		heartbeat: { enabled: false },
	});

	// ✓ With no config
	const client3 = new TypeSocketClient<CompleteApi>('ws://localhost:8080');

	// ✓ With URL object
	const client4 = new TypeSocketClient<CompleteApi>(new URL('ws://localhost:8080'));

	// ✗ Invalid URL
	// @ts-expect-error - URL must be string or URL object
	const clientBadUrl = new TypeSocketClient<CompleteApi>(12345);
}

// ============================================================================
// Test 14: Off Handlers Type Safety
// ============================================================================

function testOffHandlerTypes() {
	const client = new TypeSocketClient<CompleteApi>('ws://localhost:8080');

	// ✓ Removing handlers with correct types
	const connectedHandler = () => {};
	const disconnectedHandler = (info: import('../src/types.js').DisconnectInfo) => {};
	const errorHandler = (error: import('../src/types.js').TypeSocketError) => {};
	const messageHandler = (data: { text: string; userId: number }) => {};

	client.off.connected(connectedHandler);
	client.off.disconnected(disconnectedHandler);
	client.off.error(errorHandler);
	client.off.message('chat', messageHandler);

	// ✗ Removing with wrong handler types
	// @ts-expect-error - connected handler takes no parameters
	client.off.connected((param: string) => {});

	// @ts-expect-error - message handler for wrong message type
	client.off.message('chat', (data: { wrong: boolean }) => {});
}

// ============================================================================
// Summary
// ============================================================================

/**
 * If this file compiles without TypeScript errors (except where @ts-expect-error is used),
 * then all type safety and intellisense features are working correctly:
 *
 * ✅ Message type inference (sendable vs receivable)
 * ✅ Payload type validation (sent vs received)
 * ✅ Heartbeat configuration type inference from API
 * ✅ Event handler type inference
 * ✅ Conditional types (queue, reconnection, heartbeat)
 * ✅ Method chaining return types
 * ✅ Metrics type safety
 * ✅ Complex nested types
 * ✅ Constructor parameter types
 * ✅ Off handlers type safety
 *
 * All @ts-expect-error lines should produce compilation errors.
 * If any @ts-expect-error line compiles successfully, the test has FAILED.
 */

export {};
