import { TypeSocketConnectionState, type ExtractReceivableMessageTypes, type ExtractReceivedPayloadType, type ExtractSendableMessageTypes, type ExtractSentPayloadType, type TypeSocketConfig } from './types.js';

type ValidMessage<T extends TypeSocketConfig> = {
	[K in ExtractReceivableMessageTypes<T>]: { type: K; data: ExtractReceivedPayloadType<T, K> };
}[ExtractReceivableMessageTypes<T>];

function assertIsValidMessage<T extends TypeSocketConfig>(message: object): asserts message is ValidMessage<T> {
	if (!('type' in message) || typeof message.type !== 'string') {
		throw new Error('Invalid message: missing or invalid type field');
	}
	if (!('data' in message)) {
		throw new Error('Invalid message: missing data field');
	}
}

export interface ReconnectionConfig {
	enabled?: boolean;
	maxRetries?: number;
	initialDelay?: number;
	maxDelay?: number;
	delayMultiplier?: number;
}

export default class TypeSocketClient<T extends TypeSocketConfig> {
	private readonly _url: URL;
	private readonly _reconnectionConfig: Required<ReconnectionConfig>;
	private readonly _onConnectedHandlers = new Set<(event?: Event) => void>();
	private readonly _onDisconnectedHandlers = new Set<(event?: CloseEvent) => void>();
	private readonly _onErrorHandlers = new Set<(event?: Event) => void>();
	private _onMessageHandlers: Partial<{ [K in ExtractReceivableMessageTypes<T>]: (data: ExtractReceivedPayloadType<T, K>) => void }> = {};
	private _connection: WebSocket | null = null;
	private _reconnectionAttempts = 0;
	private _reconnectionTimeout: ReturnType<typeof setTimeout> | null = null;
	private _intentionalDisconnect = false;

	public constructor(url: URL | string, reconnectionConfig?: ReconnectionConfig) {
		this._url = typeof url === 'string' ? new URL(url) : url;
		this._reconnectionConfig = {
			enabled: reconnectionConfig?.enabled ?? true,
			maxRetries: reconnectionConfig?.maxRetries ?? Infinity,
			initialDelay: reconnectionConfig?.initialDelay ?? 1000,
			maxDelay: reconnectionConfig?.maxDelay ?? 30000,
			delayMultiplier: reconnectionConfig?.delayMultiplier ?? 2,
		};
	}

	public get connectionState(): TypeSocketConnectionState {
		if (!this._connection) return TypeSocketConnectionState.CLOSED;

		switch (this._connection.readyState) {
			case WebSocket.CONNECTING:
				return TypeSocketConnectionState.CONNECTING;
			case WebSocket.OPEN:
				return TypeSocketConnectionState.CONNECTED;
			case WebSocket.CLOSING:
				return TypeSocketConnectionState.CLOSING;
			case WebSocket.CLOSED:
			default:
				return TypeSocketConnectionState.CLOSED;
		}
	}

	public connect() {
		if (this._connection) this.disconnect();
		this._intentionalDisconnect = false;
		this._connection = new WebSocket(this._url);
		this._setHandlersToConnection();
	}

	private _scheduleReconnection() {
		if (!this._reconnectionConfig.enabled || this._intentionalDisconnect) return;
		if (this._reconnectionAttempts >= this._reconnectionConfig.maxRetries) return;

		const delay = Math.min(
			this._reconnectionConfig.initialDelay * Math.pow(this._reconnectionConfig.delayMultiplier, this._reconnectionAttempts),
			this._reconnectionConfig.maxDelay,
		);

		this._reconnectionTimeout = setTimeout(() => {
			this._reconnectionAttempts++;
			this.connect();
		}, delay);
	}

	private _cancelReconnection() {
		if (this._reconnectionTimeout) {
			clearTimeout(this._reconnectionTimeout);
			this._reconnectionTimeout = null;
		}
	}

	public addOnConnectedHandler(handler: (event?: Event) => void): typeof this {
		this._onConnectedHandlers.add(handler);
		this._setHandlersToConnection({ connected: true });
		return this;
	}

	public addOnDisconnectedHandler(handler: (event?: CloseEvent) => void): typeof this {
		this._onDisconnectedHandlers.add(handler);
		this._setHandlersToConnection({ disconnected: true });
		return this;
	}

	public addOnErrorHandler(handler: (event?: Event) => void): typeof this {
		this._onErrorHandlers.add(handler);
		this._setHandlersToConnection({ error: true });
		return this;
	}

	public removeOnConnectedHandler(handler: (event?: Event) => void): typeof this {
		this._onConnectedHandlers.delete(handler);
		this._setHandlersToConnection({ connected: true });
		return this;
	}

	public removeOnDisconnectedHandler(handler: (event?: CloseEvent) => void): typeof this {
		this._onDisconnectedHandlers.delete(handler);
		this._setHandlersToConnection({ disconnected: true });
		return this;
	}

	public removeOnErrorHandler(handler: (event?: Event) => void): typeof this {
		this._onErrorHandlers.delete(handler);
		this._setHandlersToConnection({ error: true });
		return this;
	}

	public onReceiveMessage<K extends ExtractReceivableMessageTypes<T>>(messageType: K, handler: (data: ExtractReceivedPayloadType<T, K>) => void): typeof this {
		this._onMessageHandlers[messageType] = handler;
		this._setHandlersToConnection({ message: true });
		return this;
	}

	public sendMessage<K extends ExtractSendableMessageTypes<T>>(type: K, data: ExtractSentPayloadType<T, K>): boolean {
		try {
			if (!this._connection || this.connectionState !== TypeSocketConnectionState.CONNECTED) return false;
			this._connection.send(
				JSON.stringify({
					type,
					data,
				}),
			);
			return true;
		} catch {
			return false;
		}
	}

	private _setHandlersToConnection(handlers?: { connected?: true; disconnected?: boolean; error?: boolean; message?: boolean }) {
		if (!this._connection) return;

		if (!handlers || handlers.connected) {
			this._connection.onopen = (event) => {
				this._reconnectionAttempts = 0;
				this._cancelReconnection();
				this._onConnectedHandlers.forEach((handler) => handler(event));
			};
		}

		if (!handlers || handlers.disconnected) {
			this._connection.onclose = (event) => {
				this._onDisconnectedHandlers.forEach((handler) => handler(event));
				this._scheduleReconnection();
			};
		}

		if (!handlers || handlers.error) {
			this._connection.onerror = (event) => this._onErrorHandlers.forEach((handler) => handler(event));
		}

		if (!handlers || handlers.message) {
			this._connection.onmessage = (message) => {
				try {
					const payload = JSON.parse(message.data);
					assertIsValidMessage<T>(payload);
					const handler = this._onMessageHandlers[payload.type];
					if (handler) handler(payload.data);
				} catch (error) {
					const errorEvent = new Event('error');
					Object.defineProperty(errorEvent, 'error', { value: error });
					Object.defineProperty(errorEvent, 'message', { value: error instanceof Error ? error.message : 'Invalid message format' });
					this._onErrorHandlers.forEach((handler) => handler(errorEvent));
				}
			};
		}
	}

	public disconnect(reset?: true) {
		if (!this._connection) return;
		this._intentionalDisconnect = true;
		this._cancelReconnection();
		this._connection.close();

		if (reset) {
			this._connection = null;
			this._onDisconnectedHandlers.clear();
			this._onConnectedHandlers.clear();
			this._onErrorHandlers.clear();
			this._onMessageHandlers = {};
			this._reconnectionAttempts = 0;
		}
	}

	public enableReconnection(): typeof this {
		this._reconnectionConfig.enabled = true;
		return this;
	}

	public disableReconnection(): typeof this {
		this._reconnectionConfig.enabled = false;
		this._cancelReconnection();
		return this;
	}

	public get reconnectionAttempts(): number {
		return this._reconnectionAttempts;
	}

	public get isReconnecting(): boolean {
		return this._reconnectionTimeout !== null;
	}
}
