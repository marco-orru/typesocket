export enum TypeSocketConnectionState {
	CONNECTING = 'connecting',
	CONNECTED = 'connected',
	CLOSING = 'closing',
	CLOSED = 'closed',
}

export type MessageDirectionConfig = { duplex: unknown } | { sent: unknown; received?: unknown } | { received: unknown; sent?: unknown };

export type TypeSocketMessageGroupConfig = {
	messages: Record<string, MessageDirectionConfig>;
	rooms?: Record<string, string | number | boolean | object> | string;
};

export type TypeSocketConfig = {
	heartbeat?: {
		ping: string;
		pong: string;
		hasTimestamp: boolean;
	};
} & TypeSocketMessageGroupConfig;

export type ExtractSendableMessageTypes<T extends TypeSocketConfig> = {
	[K in keyof T['messages']]: T['messages'][K] extends { duplex: unknown } ? K : T['messages'][K] extends { sent: unknown } ? K : never;
}[keyof T['messages']];

export type ExtractReceivableMessageTypes<T extends TypeSocketConfig> = {
	[K in keyof T['messages']]: T['messages'][K] extends { duplex: unknown } ? K : T['messages'][K] extends { received: unknown } ? K : never;
}[keyof T['messages']];

export type ExtractSentPayloadType<T extends TypeSocketConfig, K extends ExtractSendableMessageTypes<T>> = T['messages'][K] extends { duplex: infer U }
	? U
	: T['messages'][K] extends { sent: infer U }
		? U
		: never;

export type ExtractReceivedPayloadType<T extends TypeSocketConfig, K extends ExtractReceivableMessageTypes<T>> = T['messages'][K] extends { duplex: infer U }
	? U
	: T['messages'][K] extends { received: infer U }
		? U
		: never;

export type ErrorCategory = 'parse' | 'send' | 'connection' | 'validation';

export interface TypeSocketError {
	category: ErrorCategory;
	message: string;
	timestamp: Date;
	connectionState: TypeSocketConnectionState;
	originalData?: unknown;
	originalError?: Error;
}

export interface MessageQueueConfig {
	enabled?: boolean;
	maxSize?: number;
	overflow?: 'drop-oldest' | 'drop-newest' | 'reject';
}

export interface ReconnectionConfig {
	enabled?: boolean;
	maxRetries?: number;
	initialDelay?: number;
	maxDelay?: number;
	delayMultiplier?: number;
}

export interface DisconnectInfo {
	code: number;
	reason: string;
	wasClean: boolean;
}

export interface HeartbeatConfig {
	enabled?: boolean;
	interval?: number;
	timeout?: number;
}

export interface TypeSocketClientConfig {
	reconnection?: ReconnectionConfig;
	messageQueue?: MessageQueueConfig;
	heartbeat?: HeartbeatConfig;
}

export interface ReconnectAttemptInfo {
	attempt: number;
	maxRetries: number;
	delay: number;
}

export interface QueueFullInfo {
	currentSize: number;
	maxSize: number;
	overflow: 'drop-oldest' | 'drop-newest' | 'reject';
}

export type IsQueueEnabled<C> = C extends { messageQueue: { enabled: false } } ? false : true;
export type IsReconnectionEnabled<C> = C extends { reconnection: { enabled: false } } ? false : true;
export type IsHeartbeatEnabled<C> = C extends { heartbeat: { enabled: false } } ? false : true;
