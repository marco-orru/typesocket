export enum TypeSocketConnectionState {
	CONNECTING = 'connecting',
	CONNECTED = 'connected',
	CLOSING = 'closing',
	CLOSED = 'closed',
}

export type MessageDirectionConfig = { duplex: unknown } | { sent: unknown; received?: unknown } | { received: unknown; sent?: unknown };

export type TypeSocketConfig = Record<string, MessageDirectionConfig>;

export type ExtractSendableMessageTypes<T extends TypeSocketConfig> = {
	[K in keyof T]: T[K] extends { duplex: unknown } ? K : T[K] extends { sent: unknown } ? K : never;
}[keyof T];

export type ExtractReceivableMessageTypes<T extends TypeSocketConfig> = {
	[K in keyof T]: T[K] extends { duplex: unknown } ? K : T[K] extends { received: unknown } ? K : never;
}[keyof T];

export type ExtractSentPayloadType<T extends TypeSocketConfig, K extends ExtractSendableMessageTypes<T>> = T[K] extends { duplex: infer U }
	? U
	: T[K] extends { sent: infer U }
		? U
		: never;

export type ExtractReceivedPayloadType<T extends TypeSocketConfig, K extends ExtractReceivableMessageTypes<T>> = T[K] extends { duplex: infer U }
	? U
	: T[K] extends { received: infer U }
		? U
		: never;
