/**
 * Represents the current state of a TypeSocket WebSocket connection.
 *
 * @enum {string}
 */
export enum TypeSocketConnectionState {
	/** The connection is in the process of being established */
	CONNECTING = 'connecting',
	/** The connection is established and ready to send/receive messages */
	CONNECTED = 'connected',
	/** The connection is in the process of closing */
	CLOSING = 'closing',
	/** The connection is closed */
	CLOSED = 'closed',
}

/**
 * Defines the direction configuration for a message type.
 * A message can be:
 * - Duplex: Can be both sent and received with the same payload type
 * - Sent only: Can only be sent from client to server
 * - Received only: Can only be received from server to client
 *
 * @typedef {Object} MessageDirectionApi
 */
export type MessageDirectionApi = { duplex: unknown } | { sent: unknown; received?: unknown } | { received: unknown; sent?: unknown };

/**
 * Configuration for a group of TypeSocket messages, optionally with room support.
 *
 * @typedef {Object} TypeSocketMessageGroupApi
 * @property {Record<string, MessageDirectionApi>} messages - Map of message type names to their direction configurations
 */
export type TypeSocketMessageGroupApi = {
	messages: Record<string, MessageDirectionApi>;
};

/**
 * Main TypeSocket configuration that extends message group configuration with optional heartbeat settings.
 *
 * @typedef {Object} TypeSocketApi
 * @property {Object} [heartbeat] - Optional heartbeat/ping-pong configuration
 * @property {string} heartbeat.ping - Message type identifier for ping messages
 * @property {string} heartbeat.pong - Message type identifier for pong messages
 * @property {boolean} heartbeat.hasTimestamp - Whether heartbeat messages include timestamps for RTT calculation
 */
export type TypeSocketApi = {
	heartbeat?: {
		ping: string;
		pong: string;
		hasTimestamp: boolean;
	};
} & TypeSocketMessageGroupApi;

/**
 * Utility type that extracts all message type names that can be sent from the client.
 * This includes both duplex messages and messages configured with a 'sent' direction.
 *
 * @template T - The TypeSocket configuration
 * @typedef {string} ExtractSendableMessageTypes
 */
export type ExtractSendableMessageTypes<T extends TypeSocketApi> = {
	[K in keyof T['messages']]: T['messages'][K] extends { duplex: unknown } ? K : T['messages'][K] extends { sent: unknown } ? K : never;
}[keyof T['messages']];

/**
 * Utility type that extracts all message type names that can be received by the client.
 * This includes both duplex messages and messages configured with a 'received' direction.
 *
 * @template T - The TypeSocket configuration
 * @typedef {string} ExtractReceivableMessageTypes
 */
export type ExtractReceivableMessageTypes<T extends TypeSocketApi> = {
	[K in keyof T['messages']]: T['messages'][K] extends { duplex: unknown } ? K : T['messages'][K] extends { received: unknown } ? K : never;
}[keyof T['messages']];

/**
 * Utility type that extracts the payload type for a specific sendable message.
 * For duplex messages, returns the duplex payload type.
 * For sent-only messages, returns the sent payload type.
 *
 * @template T - The TypeSocket configuration
 * @template K - The message type name (must be sendable)
 * @typedef ExtractSentPayloadType
 */
export type ExtractSentPayloadType<T extends TypeSocketApi, K extends ExtractSendableMessageTypes<T>> = T['messages'][K] extends { duplex: infer U }
	? U
	: T['messages'][K] extends { sent: infer U }
		? U
		: never;

/**
 * Utility type that extracts the payload type for a specific receivable message.
 * For duplex messages, returns the duplex payload type.
 * For received-only messages, returns the received payload type.
 *
 * @template T - The TypeSocket configuration
 * @template K - The message type name (must be receivable)
 * @typedef ExtractReceivedPayloadType
 */
export type ExtractReceivedPayloadType<T extends TypeSocketApi, K extends ExtractReceivableMessageTypes<T>> = T['messages'][K] extends { duplex: infer U }
	? U
	: T['messages'][K] extends { received: infer U }
		? U
		: never;

/**
 * Categories for TypeSocket errors.
 *
 * @typedef {'parse' | 'send' | 'connection' | 'validation'} ErrorCategory
 */
export type ErrorCategory = 'parse' | 'send' | 'connection' | 'validation';

/**
 * Represents an error that occurred during TypeSocket operations.
 *
 * @interface TypeSocketError
 * @property {ErrorCategory} category - The category/type of error that occurred
 * @property {string} message - Human-readable error message
 * @property {Date} timestamp - When the error occurred
 * @property {TypeSocketConnectionState} connectionState - The connection state when the error occurred
 * @property {unknown} [originalData] - Optional raw data that caused the error (e.g., malformed message)
 * @property {Error} [originalError] - Optional original JavaScript Error object if available
 */
export interface TypeSocketError {
	category: ErrorCategory;
	message: string;
	timestamp: Date;
	connectionState: TypeSocketConnectionState;
	originalData?: unknown;
	originalError?: Error;
}

/**
 * Configuration for the message queue that stores messages when the connection is not available.
 *
 * @interface MessageQueueConfig
 * @property {boolean} [enabled=true] - Whether the message queue is enabled
 * @property {number} [maxSize=100] - Maximum number of messages to queue
 * @property {'drop-oldest' | 'drop-newest' | 'reject'} [overflow='drop-oldest'] - Behavior when queue is full
 */
export interface MessageQueueConfig {
	enabled?: boolean;
	maxSize?: number;
	overflow?: 'drop-oldest' | 'drop-newest' | 'reject';
}

/**
 * Configuration for automatic reconnection behavior.
 *
 * @interface ReconnectionConfig
 * @property {boolean} [enabled=true] - Whether automatic reconnection is enabled
 * @property {number} [maxRetries=Infinity] - Maximum number of reconnection attempts
 * @property {number} [initialDelay=1000] - Initial delay in milliseconds before first reconnection attempt
 * @property {number} [maxDelay=30000] - Maximum delay in milliseconds between reconnection attempts
 * @property {number} [delayMultiplier=2] - Multiplier for exponential backoff between attempts
 */
export interface ReconnectionConfig {
	enabled?: boolean;
	maxRetries?: number;
	initialDelay?: number;
	maxDelay?: number;
	delayMultiplier?: number;
}

/**
 * Information about a WebSocket disconnection event.
 *
 * @interface DisconnectInfo
 * @property {number} code - WebSocket close code
 * @property {string} reason - Human-readable reason for disconnection
 * @property {boolean} wasClean - Whether the connection was closed cleanly
 */
export interface DisconnectInfo {
	code: number;
	reason: string;
	wasClean: boolean;
}

/**
 * Configuration for heartbeat/ping-pong mechanism to detect connection health.
 *
 * @template T - The TypeSocket API configuration
 * @interface HeartbeatConfig
 * @property {boolean} [enabled=false] - Whether heartbeat is enabled
 * @property {number} [interval=30000] - Interval in milliseconds between heartbeat pings
 * @property {number} [timeout=5000] - Timeout in milliseconds to wait for pong response
 * @property {string} [ping] - Message type identifier for ping messages (inferred from T['heartbeat']['ping'])
 * @property {string} [pong] - Message type identifier for pong messages (inferred from T['heartbeat']['pong'])
 * @property {boolean} [hasTimestamp=false] - Whether heartbeat messages include timestamps (inferred from T['heartbeat']['hasTimestamp'])
 */
export interface HeartbeatConfig<T extends TypeSocketApi> {
	enabled?: boolean;
	interval?: number;
	timeout?: number;
	ping?: T['heartbeat'] extends { ping: infer P } ? P : string;
	pong?: T['heartbeat'] extends { pong: infer P } ? P : string;
	hasTimestamp?: T['heartbeat'] extends { hasTimestamp: infer H } ? H : boolean;
}

/**
 * Complete configuration object for TypeSocketClient behavior.
 *
 * @template T - The TypeSocket API configuration
 * @interface TypeSocketClientConfig
 * @property {ReconnectionConfig} [reconnection] - Reconnection behavior configuration
 * @property {MessageQueueConfig} [messageQueue] - Message queue configuration
 * @property {HeartbeatConfig<T>} [heartbeat] - Heartbeat/ping-pong configuration
 */
export interface TypeSocketClientConfig<T extends TypeSocketApi> {
	reconnection?: ReconnectionConfig;
	messageQueue?: MessageQueueConfig;
	heartbeat?: HeartbeatConfig<T>;
}

/**
 * Information about a reconnection attempt.
 *
 * @interface ReconnectAttemptInfo
 * @property {number} attempt - Current attempt number (1-indexed)
 * @property {number} maxRetries - Maximum number of retry attempts allowed
 * @property {number} delay - Delay in milliseconds before this reconnection attempt
 */
export interface ReconnectAttemptInfo {
	attempt: number;
	maxRetries: number;
	delay: number;
}

/**
 * Information emitted when the message queue reaches its maximum size.
 *
 * @interface QueueFullInfo
 * @property {number} currentSize - Current size of the queue
 * @property {number} maxSize - Maximum allowed size of the queue
 * @property {'drop-oldest' | 'drop-newest' | 'reject'} overflow - Configured overflow behavior
 */
export interface QueueFullInfo {
	currentSize: number;
	maxSize: number;
	overflow: 'drop-oldest' | 'drop-newest' | 'reject';
}

/**
 * Utility type to determine if message queue is enabled based on client configuration.
 * Returns false only if explicitly disabled, true otherwise.
 *
 * @template C - The client configuration type
 * @typedef {boolean} IsQueueEnabled
 */
export type IsQueueEnabled<C> = C extends { messageQueue: { enabled: false } } ? false : true;

/**
 * Utility type to determine if reconnection is enabled based on client configuration.
 * Returns false only if explicitly disabled, true otherwise.
 *
 * @template C - The client configuration type
 * @typedef {boolean} IsReconnectionEnabled
 */
export type IsReconnectionEnabled<C> = C extends { reconnection: { enabled: false } } ? false : true;

/**
 * Utility type to determine if heartbeat is enabled based on client configuration.
 * Returns false only if explicitly disabled, true otherwise.
 *
 * @template C - The client configuration type
 * @typedef {boolean} IsHeartbeatEnabled
 */
export type IsHeartbeatEnabled<C> = C extends { heartbeat: { enabled: false } } ? false : true;
