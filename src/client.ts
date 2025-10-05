import {
	TypeSocketConnectionState,
	type DisconnectInfo,
	type ExtractReceivableMessageTypes,
	type ExtractReceivedPayloadType,
	type ExtractSendableMessageTypes,
	type ExtractSentPayloadType,
	type HeartbeatConfig,
	type IsHeartbeatEnabled,
	type IsQueueEnabled,
	type IsReconnectionEnabled,
	type MessageQueueConfig,
	type QueueFullInfo,
	type ReconnectAttemptInfo,
	type ReconnectionConfig,
	type TypeSocketClientConfig,
	type TypeSocketConfig,
	type TypeSocketError,
} from './types.js';

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

type MessageHandlerSets<T extends TypeSocketConfig> = {
	[K in ExtractReceivableMessageTypes<T>]: Set<(data: ExtractReceivedPayloadType<T, K>) => void>;
};

type PongPayload<T extends TypeSocketConfig> = T['heartbeat'] extends { hasTimestamp: true } ? { timestamp: number } : {};

class EventManager<T extends TypeSocketConfig> {
	private readonly _connectedHandlers = new Set<() => void>();
	private readonly _disconnectedHandlers = new Set<(info: DisconnectInfo) => void>();
	private readonly _errorHandlers = new Set<(error: TypeSocketError) => void>();
	private readonly _beforeReconnectHandlers = new Set<(info: ReconnectAttemptInfo) => void>();
	private readonly _queueFullHandlers = new Set<(info: QueueFullInfo) => void>();
	private readonly _heartbeatTimeoutHandlers = new Set<() => void>();
	private readonly _pingSentHandlers = new Set<(timestamp?: number) => void>();
	private readonly _pongReceivedHandlers = new Set<(timestamp?: number, rtt?: number) => void>();
	private _messageHandlers: Partial<MessageHandlerSets<T>> = {};

	public addConnectedHandler(handler: () => void): void {
		this._connectedHandlers.add(handler);
	}

	public removeConnectedHandler(handler: () => void): void {
		this._connectedHandlers.delete(handler);
	}

	public emitConnected(): void {
		this._connectedHandlers.forEach((handler) => handler());
	}

	public addDisconnectedHandler(handler: (info: DisconnectInfo) => void): void {
		this._disconnectedHandlers.add(handler);
	}

	public removeDisconnectedHandler(handler: (info: DisconnectInfo) => void): void {
		this._disconnectedHandlers.delete(handler);
	}

	public emitDisconnected(info: DisconnectInfo): void {
		this._disconnectedHandlers.forEach((handler) => handler(info));
	}

	public addErrorHandler(handler: (error: TypeSocketError) => void): void {
		this._errorHandlers.add(handler);
	}

	public removeErrorHandler(handler: (error: TypeSocketError) => void): void {
		this._errorHandlers.delete(handler);
	}

	public emitError(error: TypeSocketError): void {
		this._errorHandlers.forEach((handler) => handler(error));
	}

	public addMessageHandler<K extends ExtractReceivableMessageTypes<T>>(messageType: K, handler: (data: ExtractReceivedPayloadType<T, K>) => void): void {
		if (!this._messageHandlers[messageType]) {
			this._messageHandlers[messageType] = new Set();
		}
		this._messageHandlers[messageType]!.add(handler);
	}

	public removeMessageHandler<K extends ExtractReceivableMessageTypes<T>>(messageType: K, handler: (data: ExtractReceivedPayloadType<T, K>) => void): void {
		const handlers = this._messageHandlers[messageType];
		if (handlers) {
			handlers.delete(handler);
			if (handlers.size === 0) {
				delete this._messageHandlers[messageType];
			}
		}
	}

	public emitMessage<K extends ExtractReceivableMessageTypes<T>>(messageType: K, data: ExtractReceivedPayloadType<T, K>): void {
		const handlers = this._messageHandlers[messageType];
		if (handlers) {
			handlers.forEach((handler) => handler(data));
		}
	}

	public addBeforeReconnectHandler(handler: (info: ReconnectAttemptInfo) => void): void {
		this._beforeReconnectHandlers.add(handler);
	}

	public removeBeforeReconnectHandler(handler: (info: ReconnectAttemptInfo) => void): void {
		this._beforeReconnectHandlers.delete(handler);
	}

	public emitBeforeReconnect(info: ReconnectAttemptInfo): void {
		this._beforeReconnectHandlers.forEach((handler) => handler(info));
	}

	public addQueueFullHandler(handler: (info: QueueFullInfo) => void): void {
		this._queueFullHandlers.add(handler);
	}

	public removeQueueFullHandler(handler: (info: QueueFullInfo) => void): void {
		this._queueFullHandlers.delete(handler);
	}

	public emitQueueFull(info: QueueFullInfo): void {
		this._queueFullHandlers.forEach((handler) => handler(info));
	}

	public addHeartbeatTimeoutHandler(handler: () => void): void {
		this._heartbeatTimeoutHandlers.add(handler);
	}

	public removeHeartbeatTimeoutHandler(handler: () => void): void {
		this._heartbeatTimeoutHandlers.delete(handler);
	}

	public emitHeartbeatTimeout(): void {
		this._heartbeatTimeoutHandlers.forEach((handler) => handler());
	}

	public addPingSentHandler(handler: (timestamp?: number) => void): void {
		this._pingSentHandlers.add(handler);
	}

	public removePingSentHandler(handler: (timestamp?: number) => void): void {
		this._pingSentHandlers.delete(handler);
	}

	public emitPingSent(timestamp?: number): void {
		this._pingSentHandlers.forEach((handler) => handler(timestamp));
	}

	public addPongReceivedHandler(handler: (timestamp?: number, rtt?: number) => void): void {
		this._pongReceivedHandlers.add(handler);
	}

	public removePongReceivedHandler(handler: (timestamp?: number, rtt?: number) => void): void {
		this._pongReceivedHandlers.delete(handler);
	}

	public emitPongReceived(timestamp?: number, rtt?: number): void {
		this._pongReceivedHandlers.forEach((handler) => handler(timestamp, rtt));
	}

	public clear(): void {
		this._connectedHandlers.clear();
		this._disconnectedHandlers.clear();
		this._errorHandlers.clear();
		this._messageHandlers = {};
		this._beforeReconnectHandlers.clear();
		this._queueFullHandlers.clear();
		this._heartbeatTimeoutHandlers.clear();
		this._pingSentHandlers.clear();
		this._pongReceivedHandlers.clear();
	}
}

class HeartbeatManager<T extends TypeSocketConfig> {
	private _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private _heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
	private _lastPongReceived: Date | null = null;
	private _lastRtt: number | null = null;

	constructor(
		private readonly _config: Required<HeartbeatConfig>,
		private readonly _socketConfig: T,
		private readonly _eventManager: EventManager<T>,
		private readonly _getConnection: () => WebSocket | null,
		private readonly _getConnectionState: () => TypeSocketConnectionState,
		private readonly _closeConnection: () => void,
	) {}

	public start(): void {
		if (!this._config.enabled || !this._socketConfig.heartbeat) return;

		this.stop();

		this._heartbeatInterval = setInterval(() => {
			this.sendHeartbeat();
		}, this._config.interval);
	}

	public stop(): void {
		if (this._heartbeatInterval) {
			clearInterval(this._heartbeatInterval);
			this._heartbeatInterval = null;
		}
		if (this._heartbeatTimeout) {
			clearTimeout(this._heartbeatTimeout);
			this._heartbeatTimeout = null;
		}
	}

	public sendHeartbeat(): void {
		if (!this._socketConfig.heartbeat || this._getConnectionState() !== TypeSocketConnectionState.CONNECTED) return;

		const timestamp = this._socketConfig.heartbeat.hasTimestamp ? Date.now() : undefined;
		const pingData = timestamp !== undefined ? { timestamp } : {};

		try {
			this._getConnection()?.send(
				JSON.stringify({
					type: this._socketConfig.heartbeat.ping,
					data: pingData,
				}),
			);

			this._eventManager.emitPingSent(timestamp);

			this._heartbeatTimeout = setTimeout(() => {
				this.onTimeout();
			}, this._config.timeout);
		} catch (error) {
			this.onTimeout();
		}
	}

	public handlePong(data: PongPayload<T>): void {
		if (!this._socketConfig.heartbeat) return;

		if (this._heartbeatTimeout) {
			clearTimeout(this._heartbeatTimeout);
			this._heartbeatTimeout = null;
		}

		let timestamp: number | undefined;
		let rtt: number | undefined;

		if (this._socketConfig.heartbeat.hasTimestamp && 'timestamp' in data) {
			timestamp = data.timestamp;
			rtt = Date.now() - timestamp;
			this._lastRtt = rtt;
		}

		this._lastPongReceived = new Date();

		this._eventManager.emitPongReceived(timestamp, rtt);
	}

	public onTimeout(): void {
		this._eventManager.emitHeartbeatTimeout();
		this._closeConnection();
	}

	public get lastPongReceived(): Date | null {
		return this._lastPongReceived;
	}

	public get lastRoundTripTime(): number | null {
		return this._lastRtt;
	}

	public reset(): void {
		this.stop();
		this._lastPongReceived = null;
		this._lastRtt = null;
	}
}

class OnHandlers<T extends TypeSocketConfig, C extends TypeSocketClientConfig | undefined = undefined> {
	constructor(
		private readonly _eventManager: EventManager<T>,
		private readonly _client: TypeSocketClient<T, C>,
	) {}

	public connected(handler: () => void): TypeSocketClient<T, C> {
		this._eventManager.addConnectedHandler(handler);
		return this._client;
	}

	public disconnected(handler: (info: DisconnectInfo) => void): TypeSocketClient<T, C> {
		this._eventManager.addDisconnectedHandler(handler);
		return this._client;
	}

	public error(handler: (error: TypeSocketError) => void): TypeSocketClient<T, C> {
		this._eventManager.addErrorHandler(handler);
		return this._client;
	}

	public message<K extends ExtractReceivableMessageTypes<T>>(messageType: K, handler: (data: ExtractReceivedPayloadType<T, K>) => void): TypeSocketClient<T, C> {
		this._eventManager.addMessageHandler(messageType, handler);
		return this._client;
	}

	public beforeReconnect(handler: (info: ReconnectAttemptInfo) => void): IsReconnectionEnabled<C> extends true ? TypeSocketClient<T, C> : never {
		this._eventManager.addBeforeReconnectHandler(handler);
		return this._client as IsReconnectionEnabled<C> extends true ? TypeSocketClient<T, C> : never;
	}

	public queueFull(handler: (info: QueueFullInfo) => void): IsQueueEnabled<C> extends true ? TypeSocketClient<T, C> : never {
		this._eventManager.addQueueFullHandler(handler);
		return this._client as IsQueueEnabled<C> extends true ? TypeSocketClient<T, C> : never;
	}

	public heartbeatTimeout(handler: () => void): IsHeartbeatEnabled<C> extends true ? TypeSocketClient<T, C> : never {
		this._eventManager.addHeartbeatTimeoutHandler(handler);
		return this._client as IsHeartbeatEnabled<C> extends true ? TypeSocketClient<T, C> : never;
	}

	public pingSent(handler: (timestamp?: number) => void): IsHeartbeatEnabled<C> extends true ? TypeSocketClient<T, C> : never {
		this._eventManager.addPingSentHandler(handler);
		return this._client as IsHeartbeatEnabled<C> extends true ? TypeSocketClient<T, C> : never;
	}

	public pongReceived(handler: (timestamp?: number, rtt?: number) => void): IsHeartbeatEnabled<C> extends true ? TypeSocketClient<T, C> : never {
		this._eventManager.addPongReceivedHandler(handler);
		return this._client as IsHeartbeatEnabled<C> extends true ? TypeSocketClient<T, C> : never;
	}
}

class OffHandlers<T extends TypeSocketConfig, C extends TypeSocketClientConfig | undefined = undefined> {
	constructor(
		private readonly _eventManager: EventManager<T>,
		private readonly _client: TypeSocketClient<T, C>,
	) {}

	public connected(handler: () => void): TypeSocketClient<T, C> {
		this._eventManager.removeConnectedHandler(handler);
		return this._client;
	}

	public disconnected(handler: (info: DisconnectInfo) => void): TypeSocketClient<T, C> {
		this._eventManager.removeDisconnectedHandler(handler);
		return this._client;
	}

	public error(handler: (error: TypeSocketError) => void): TypeSocketClient<T, C> {
		this._eventManager.removeErrorHandler(handler);
		return this._client;
	}

	public message<K extends ExtractReceivableMessageTypes<T>>(messageType: K, handler: (data: ExtractReceivedPayloadType<T, K>) => void): TypeSocketClient<T, C> {
		this._eventManager.removeMessageHandler(messageType, handler);
		return this._client;
	}

	public beforeReconnect(handler: (info: ReconnectAttemptInfo) => void): IsReconnectionEnabled<C> extends true ? TypeSocketClient<T, C> : never {
		this._eventManager.removeBeforeReconnectHandler(handler);
		return this._client as IsReconnectionEnabled<C> extends true ? TypeSocketClient<T, C> : never;
	}

	public queueFull(handler: (info: QueueFullInfo) => void): IsQueueEnabled<C> extends true ? TypeSocketClient<T, C> : never {
		this._eventManager.removeQueueFullHandler(handler);
		return this._client as IsQueueEnabled<C> extends true ? TypeSocketClient<T, C> : never;
	}

	public heartbeatTimeout(handler: () => void): IsHeartbeatEnabled<C> extends true ? TypeSocketClient<T, C> : never {
		this._eventManager.removeHeartbeatTimeoutHandler(handler);
		return this._client as IsHeartbeatEnabled<C> extends true ? TypeSocketClient<T, C> : never;
	}

	public pingSent(handler: (timestamp?: number) => void): IsHeartbeatEnabled<C> extends true ? TypeSocketClient<T, C> : never {
		this._eventManager.removePingSentHandler(handler);
		return this._client as IsHeartbeatEnabled<C> extends true ? TypeSocketClient<T, C> : never;
	}

	public pongReceived(handler: (timestamp?: number, rtt?: number) => void): IsHeartbeatEnabled<C> extends true ? TypeSocketClient<T, C> : never {
		this._eventManager.removePongReceivedHandler(handler);
		return this._client as IsHeartbeatEnabled<C> extends true ? TypeSocketClient<T, C> : never;
	}
}

class QueueManager<T extends TypeSocketConfig> {
	private _messageQueue: Array<{ type: ExtractSendableMessageTypes<T>; data: unknown }> = [];

	constructor(
		private readonly _config: Required<MessageQueueConfig>,
		private readonly _eventManager: EventManager<T>,
		private readonly _getConnection: () => WebSocket | null,
		private readonly _getConnectionState: () => TypeSocketConnectionState,
	) {}

	public get isEnabled(): boolean {
		return this._config.enabled;
	}

	public get size(): number {
		return this._messageQueue.length;
	}

	public get messages(): ReadonlyArray<{ type: ExtractSendableMessageTypes<T>; data: unknown }> {
		return [...this._messageQueue];
	}

	public clear(): void {
		this._messageQueue = [];
	}

	public enqueue<K extends ExtractSendableMessageTypes<T>>(type: K, data: ExtractSentPayloadType<T, K>): boolean {
		if (this._messageQueue.length >= this._config.maxSize) {
			const queueFullInfo: QueueFullInfo = {
				currentSize: this._messageQueue.length,
				maxSize: this._config.maxSize,
				overflow: this._config.overflow,
			};

			this._eventManager.emitQueueFull(queueFullInfo);

			switch (this._config.overflow) {
				case 'drop-oldest':
					this._messageQueue.shift();
					break;
				case 'drop-newest':
					return false;
				case 'reject':
					return false;
			}
		}

		this._messageQueue.push({ type, data });
		return true;
	}

	public flush(): void {
		while (this._messageQueue.length > 0 && this._getConnectionState() === TypeSocketConnectionState.CONNECTED) {
			const message = this._messageQueue.shift();
			if (message) {
				try {
					this._getConnection()?.send(JSON.stringify(message));
				} catch (error) {
					this._messageQueue.unshift(message);
					break;
				}
			}
		}
	}

	public reset(): void {
		this._messageQueue = [];
	}
}

class MetricsManager<T extends TypeSocketConfig> {
	constructor(
		private readonly _getConnectionState: () => TypeSocketConnectionState,
		private readonly _reconnectionManager: ReconnectionManager<T>,
		private readonly _heartbeatManager: HeartbeatManager<T>,
		private readonly _queueManager: QueueManager<T>,
	) {}

	public get connectionState(): TypeSocketConnectionState {
		return this._getConnectionState();
	}

	public get reconnectionAttempts(): number {
		return this._reconnectionManager.attempts;
	}

	public get isReconnecting(): boolean {
		return this._reconnectionManager.isReconnecting;
	}

	public get lastPongReceived(): Date | null {
		return this._heartbeatManager.lastPongReceived;
	}

	public get lastRoundTripTime(): number | null {
		return this._heartbeatManager.lastRoundTripTime;
	}

	public get queueSize(): number {
		return this._queueManager.size;
	}
}

class ReconnectionManager<T extends TypeSocketConfig> {
	private _reconnectionAttempts = 0;
	private _reconnectionTimeout: ReturnType<typeof setTimeout> | null = null;
	private _intentionalDisconnect = false;

	constructor(
		private readonly _config: Required<ReconnectionConfig>,
		private readonly _eventManager: EventManager<T>,
		private readonly _connect: () => void,
		private readonly _client: TypeSocketClient<T>,
	) {}

	public get attempts(): number {
		return this._reconnectionAttempts;
	}

	public get isReconnecting(): boolean {
		return this._reconnectionTimeout !== null;
	}

	public enable(): TypeSocketClient<T> {
		this._config.enabled = true;
		return this._client;
	}

	public disable(): TypeSocketClient<T> {
		this._config.enabled = false;
		this.cancel();
		return this._client;
	}

	public schedule(): void {
		if (!this._config.enabled || this._intentionalDisconnect) return;
		if (this._reconnectionAttempts >= this._config.maxRetries) return;

		const delay = Math.min(this._config.initialDelay * Math.pow(this._config.delayMultiplier, this._reconnectionAttempts), this._config.maxDelay);

		const reconnectInfo: ReconnectAttemptInfo = {
			attempt: this._reconnectionAttempts + 1,
			maxRetries: this._config.maxRetries,
			delay,
		};

		this._eventManager.emitBeforeReconnect(reconnectInfo);

		this._reconnectionTimeout = setTimeout(() => {
			this._reconnectionAttempts++;
			this._connect();
		}, delay);
	}

	public cancel(): void {
		if (this._reconnectionTimeout) {
			clearTimeout(this._reconnectionTimeout);
			this._reconnectionTimeout = null;
		}
	}

	public onConnected(): void {
		this._reconnectionAttempts = 0;
		this.cancel();
	}

	public markIntentionalDisconnect(): void {
		this._intentionalDisconnect = true;
	}

	public reset(): void {
		this._reconnectionAttempts = 0;
		this._intentionalDisconnect = false;
		this.cancel();
	}
}

export default class TypeSocketClient<T extends TypeSocketConfig, const C extends TypeSocketClientConfig | undefined = undefined> {
	private readonly _url: URL;
	private readonly _socketConfig: T;
	private readonly _eventManager: EventManager<T>;
	private readonly _heartbeatManager: HeartbeatManager<T>;
	private readonly _queueManager: QueueManager<T>;
	private readonly _reconnectionManager: ReconnectionManager<T>;
	private _connection: WebSocket | null = null;
	private _isDestroyed = false;

	public readonly on: OnHandlers<T, C>;
	public readonly off: OffHandlers<T, C>;
	public readonly queue: IsQueueEnabled<C> extends true ? QueueManager<T> : never;
	public readonly metrics: MetricsManager<T>;
	public readonly reconnection: IsReconnectionEnabled<C> extends true ? ReconnectionManager<T> : never;

	public constructor(url: URL | string, socketConfig: T, config?: C) {
		this._url = typeof url === 'string' ? new URL(url) : url;
		this._socketConfig = socketConfig;

		this._eventManager = new EventManager<T>();

		const heartbeatConfig: Required<HeartbeatConfig> = {
			enabled: config?.heartbeat?.enabled ?? false,
			interval: config?.heartbeat?.interval ?? 30000,
			timeout: config?.heartbeat?.timeout ?? 5000,
		};
		this._heartbeatManager = new HeartbeatManager<T>(
			heartbeatConfig,
			socketConfig,
			this._eventManager,
			() => this._connection,
			() => this.connectionState,
			() => {
				if (this._connection) {
					this._connection.close();
				}
			},
		);

		const messageQueueConfig: Required<MessageQueueConfig> = {
			enabled: config?.messageQueue?.enabled ?? true,
			maxSize: config?.messageQueue?.maxSize ?? 100,
			overflow: config?.messageQueue?.overflow ?? 'drop-oldest',
		};
		this._queueManager = new QueueManager<T>(
			messageQueueConfig,
			this._eventManager,
			() => this._connection,
			() => this.connectionState,
		);

		const reconnectionConfig: Required<ReconnectionConfig> = {
			enabled: config?.reconnection?.enabled ?? true,
			maxRetries: config?.reconnection?.maxRetries ?? Infinity,
			initialDelay: config?.reconnection?.initialDelay ?? 1000,
			maxDelay: config?.reconnection?.maxDelay ?? 30000,
			delayMultiplier: config?.reconnection?.delayMultiplier ?? 2,
		};
		this._reconnectionManager = new ReconnectionManager<T>(reconnectionConfig, this._eventManager, () => this.connect(), this);

		this.on = new OnHandlers(this._eventManager, this);
		this.off = new OffHandlers(this._eventManager, this);
		this.queue = this._queueManager as IsQueueEnabled<C> extends true ? QueueManager<T> : never;
		this.metrics = new MetricsManager(() => this.connectionState, this._reconnectionManager, this._heartbeatManager, this._queueManager);
		this.reconnection = this._reconnectionManager as IsReconnectionEnabled<C> extends true ? ReconnectionManager<T> : never;
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
		if (this._connection) this.disconnect(true);
		this._reconnectionManager.reset();
		this._connection = new WebSocket(this._url);
		this._setHandlersToConnection();
	}

	public sendMessage<K extends ExtractSendableMessageTypes<T>>(type: K, data: ExtractSentPayloadType<T, K>): boolean {
		if (this._isDestroyed) return false;

		try {
			if (!this._connection || this.connectionState !== TypeSocketConnectionState.CONNECTED) {
				if (this._queueManager.isEnabled) {
					return this._queueManager.enqueue(type, data);
				}
				return false;
			}

			this._connection.send(
				JSON.stringify({
					type,
					data,
				}),
			);
			return true;
		} catch (error) {
			const errorObj: TypeSocketError = {
				category: 'send',
				message: error instanceof Error ? error.message : 'Failed to send message',
				timestamp: new Date(),
				connectionState: this.connectionState,
				originalData: { type, data },
			};
			if (error instanceof Error) {
				errorObj.originalError = error;
			}
			this._emitError(errorObj);
			return false;
		}
	}

	private _emitError(error: TypeSocketError): void {
		this._eventManager.emitError(error);
	}

	private _setHandlersToConnection(handlers?: { connected?: true; disconnected?: boolean; error?: boolean; message?: boolean }) {
		if (!this._connection) return;

		if (!handlers || handlers.connected) {
			this._connection.onopen = () => {
				this._reconnectionManager.onConnected();
				this._queueManager.flush();
				this._heartbeatManager.start();
				this._eventManager.emitConnected();
			};
		}

		if (!handlers || handlers.disconnected) {
			this._connection.onclose = (event) => {
				this._heartbeatManager.stop();
				const info: DisconnectInfo = {
					code: event.code,
					reason: event.reason,
					wasClean: event.wasClean,
				};
				this._eventManager.emitDisconnected(info);
				this._reconnectionManager.schedule();
			};
		}

		if (!handlers || handlers.error) {
			this._connection.onerror = (event) => {
				this._emitError({
					category: 'connection',
					message: 'WebSocket connection error',
					timestamp: new Date(),
					connectionState: this.connectionState,
					originalData: event,
				});
			};
		}

		if (!handlers || handlers.message) {
			this._connection.onmessage = (message) => {
				try {
					const payload = JSON.parse(message.data);
					assertIsValidMessage<T>(payload);

					if (this._socketConfig.heartbeat && payload.type === this._socketConfig.heartbeat.pong) {
						this._heartbeatManager.handlePong(payload.data as PongPayload<T>);
						return;
					}

					this._eventManager.emitMessage(payload.type, payload.data);
				} catch (error) {
					const errorObj: TypeSocketError = {
						category: 'parse',
						message: error instanceof Error ? error.message : 'Invalid message format',
						timestamp: new Date(),
						connectionState: this.connectionState,
						originalData: message.data,
					};
					if (error instanceof Error) {
						errorObj.originalError = error;
					}
					this._emitError(errorObj);
				}
			};
		}
	}

	public disconnect(reset?: true) {
		if (!this._connection) return;
		this._reconnectionManager.markIntentionalDisconnect();
		this._reconnectionManager.cancel();
		this._heartbeatManager.stop();

		if (this._connection) this._connection.close();

		if (reset) {
			this._connection = null;
			this._eventManager.clear();
			this._heartbeatManager.reset();
			this._queueManager.reset();
			this._reconnectionManager.reset();
			this._isDestroyed = true;
		}
	}
}
