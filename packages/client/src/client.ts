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
	type TypeSocketApi,
	type TypeSocketError,
} from './types.js';

/**
 * Internal type representing a valid received message structure.
 * Maps each receivable message type to its corresponding typed payload.
 *
 * @template T - The TypeSocket configuration
 * @internal
 */
type ValidMessage<T extends TypeSocketApi> = {
	[K in ExtractReceivableMessageTypes<T>]: { type: K; data: ExtractReceivedPayloadType<T, K> };
}[ExtractReceivableMessageTypes<T>];

/**
 * Type guard assertion function that validates a received message has the correct structure.
 * Throws an error if the message is invalid.
 *
 * @template T - The TypeSocket configuration
 * @param {object} message - The message object to validate
 * @throws {Error} If the message is missing type or data fields
 * @internal
 */
function assertIsValidMessage<T extends TypeSocketApi>(message: object): asserts message is ValidMessage<T> {
	if (!('type' in message) || typeof message.type !== 'string') {
		throw new Error('Invalid message: missing or invalid type field');
	}
	if (!('data' in message)) {
		throw new Error('Invalid message: missing data field');
	}
}

/**
 * Internal type mapping message types to their handler sets.
 * Each message type has a Set of handler functions for that specific message payload.
 *
 * @template T - The TypeSocket configuration
 * @internal
 */
type MessageHandlerSets<T extends TypeSocketApi> = {
	[K in ExtractReceivableMessageTypes<T>]: Set<(data: ExtractReceivedPayloadType<T, K>) => void>;
};

/**
 * Internal type for pong message payload.
 * Conditionally includes timestamp if configured in the heartbeat config settings.
 *
 * @internal
 */
type PongPayload = { timestamp?: number };

/**
 * Internal event manager that handles registration and emission of all TypeSocket events.
 * Manages separate handler sets for each event type and provides methods to add, remove, and emit events.
 *
 * @template T - The TypeSocket configuration
 * @internal
 */
class EventManager<T extends TypeSocketApi> {
	private readonly _connectedHandlers = new Set<() => void>();
	private readonly _disconnectedHandlers = new Set<(info: DisconnectInfo) => void>();
	private readonly _errorHandlers = new Set<(error: TypeSocketError) => void>();
	private readonly _beforeReconnectHandlers = new Set<(info: ReconnectAttemptInfo) => void>();
	private readonly _queueFullHandlers = new Set<(info: QueueFullInfo) => void>();
	private readonly _heartbeatTimeoutHandlers = new Set<() => void>();
	private readonly _pingSentHandlers = new Set<(timestamp?: number) => void>();
	private readonly _pongReceivedHandlers = new Set<(timestamp?: number, rtt?: number) => void>();
	private _messageHandlers: Partial<MessageHandlerSets<T>> = {};

	/**
	 * Registers a handler for the 'connected' event.
	 * @param {() => void} handler - The handler function to register
	 */
	public addConnectedHandler(handler: () => void): void {
		this._connectedHandlers.add(handler);
	}

	/**
	 * Removes a previously registered 'connected' event handler.
	 * @param {() => void} handler - The handler function to remove
	 */
	public removeConnectedHandler(handler: () => void): void {
		this._connectedHandlers.delete(handler);
	}

	/**
	 * Emits the 'connected' event to all registered handlers.
	 */
	public emitConnected(): void {
		this._connectedHandlers.forEach((handler) => handler());
	}

	/**
	 * Registers a handler for the 'disconnected' event.
	 * @param {(info: DisconnectInfo) => void} handler - The handler function to register
	 */
	public addDisconnectedHandler(handler: (info: DisconnectInfo) => void): void {
		this._disconnectedHandlers.add(handler);
	}

	/**
	 * Removes a previously registered 'disconnected' event handler.
	 * @param {(info: DisconnectInfo) => void} handler - The handler function to remove
	 */
	public removeDisconnectedHandler(handler: (info: DisconnectInfo) => void): void {
		this._disconnectedHandlers.delete(handler);
	}

	/**
	 * Emits the 'disconnected' event to all registered handlers.
	 * @param {DisconnectInfo} info - Disconnection information
	 */
	public emitDisconnected(info: DisconnectInfo): void {
		this._disconnectedHandlers.forEach((handler) => handler(info));
	}

	/**
	 * Registers a handler for the 'error' event.
	 * @param {(error: TypeSocketError) => void} handler - The handler function to register
	 */
	public addErrorHandler(handler: (error: TypeSocketError) => void): void {
		this._errorHandlers.add(handler);
	}

	/**
	 * Removes a previously registered 'error' event handler.
	 * @param {(error: TypeSocketError) => void} handler - The handler function to remove
	 */
	public removeErrorHandler(handler: (error: TypeSocketError) => void): void {
		this._errorHandlers.delete(handler);
	}

	/**
	 * Emits the 'error' event to all registered handlers.
	 * @param {TypeSocketError} error - The error that occurred
	 */
	public emitError(error: TypeSocketError): void {
		this._errorHandlers.forEach((handler) => handler(error));
	}

	/**
	 * Registers a handler for a specific message type.
	 * @template K - The message type
	 * @param {K} messageType - The type of message to handle
	 * @param {(data: ExtractReceivedPayloadType<T, K>) => void} handler - The handler function to register
	 */
	public addMessageHandler<K extends ExtractReceivableMessageTypes<T>>(messageType: K, handler: (data: ExtractReceivedPayloadType<T, K>) => void): void {
		if (!this._messageHandlers[messageType]) {
			this._messageHandlers[messageType] = new Set();
		}
		this._messageHandlers[messageType]!.add(handler);
	}

	/**
	 * Removes a previously registered message handler for a specific message type.
	 * @template K - The message type
	 * @param {K} messageType - The type of message to remove handler for
	 * @param {(data: ExtractReceivedPayloadType<T, K>) => void} handler - The handler function to remove
	 */
	public removeMessageHandler<K extends ExtractReceivableMessageTypes<T>>(messageType: K, handler: (data: ExtractReceivedPayloadType<T, K>) => void): void {
		const handlers = this._messageHandlers[messageType];
		if (handlers) {
			handlers.delete(handler);
			if (handlers.size === 0) {
				delete this._messageHandlers[messageType];
			}
		}
	}

	/**
	 * Emits a message event to all handlers registered for the specific message type.
	 * @template K - The message type
	 * @param {K} messageType - The type of message being emitted
	 * @param {ExtractReceivedPayloadType<T, K>} data - The message payload
	 */
	public emitMessage<K extends ExtractReceivableMessageTypes<T>>(messageType: K, data: ExtractReceivedPayloadType<T, K>): void {
		const handlers = this._messageHandlers[messageType];
		if (handlers) {
			handlers.forEach((handler) => handler(data));
		}
	}

	/**
	 * Registers a handler for the 'beforeReconnect' event.
	 * @param {(info: ReconnectAttemptInfo) => void} handler - The handler function to register
	 */
	public addBeforeReconnectHandler(handler: (info: ReconnectAttemptInfo) => void): void {
		this._beforeReconnectHandlers.add(handler);
	}

	/**
	 * Removes a previously registered 'beforeReconnect' event handler.
	 * @param {(info: ReconnectAttemptInfo) => void} handler - The handler function to remove
	 */
	public removeBeforeReconnectHandler(handler: (info: ReconnectAttemptInfo) => void): void {
		this._beforeReconnectHandlers.delete(handler);
	}

	/**
	 * Emits the 'beforeReconnect' event to all registered handlers.
	 * @param {ReconnectAttemptInfo} info - Reconnection attempt information
	 */
	public emitBeforeReconnect(info: ReconnectAttemptInfo): void {
		this._beforeReconnectHandlers.forEach((handler) => handler(info));
	}

	/**
	 * Registers a handler for the 'queueFull' event.
	 * @param {(info: QueueFullInfo) => void} handler - The handler function to register
	 */
	public addQueueFullHandler(handler: (info: QueueFullInfo) => void): void {
		this._queueFullHandlers.add(handler);
	}

	/**
	 * Removes a previously registered 'queueFull' event handler.
	 * @param {(info: QueueFullInfo) => void} handler - The handler function to remove
	 */
	public removeQueueFullHandler(handler: (info: QueueFullInfo) => void): void {
		this._queueFullHandlers.delete(handler);
	}

	/**
	 * Emits the 'queueFull' event to all registered handlers.
	 * @param {QueueFullInfo} info - Queue full information
	 */
	public emitQueueFull(info: QueueFullInfo): void {
		this._queueFullHandlers.forEach((handler) => handler(info));
	}

	/**
	 * Registers a handler for the 'heartbeatTimeout' event.
	 * @param {() => void} handler - The handler function to register
	 */
	public addHeartbeatTimeoutHandler(handler: () => void): void {
		this._heartbeatTimeoutHandlers.add(handler);
	}

	/**
	 * Removes a previously registered 'heartbeatTimeout' event handler.
	 * @param {() => void} handler - The handler function to remove
	 */
	public removeHeartbeatTimeoutHandler(handler: () => void): void {
		this._heartbeatTimeoutHandlers.delete(handler);
	}

	/**
	 * Emits the 'heartbeatTimeout' event to all registered handlers.
	 */
	public emitHeartbeatTimeout(): void {
		this._heartbeatTimeoutHandlers.forEach((handler) => handler());
	}

	/**
	 * Registers a handler for the 'pingSent' event.
	 * @param {(timestamp?: number) => void} handler - The handler function to register
	 */
	public addPingSentHandler(handler: (timestamp?: number) => void): void {
		this._pingSentHandlers.add(handler);
	}

	/**
	 * Removes a previously registered 'pingSent' event handler.
	 * @param {(timestamp?: number) => void} handler - The handler function to remove
	 */
	public removePingSentHandler(handler: (timestamp?: number) => void): void {
		this._pingSentHandlers.delete(handler);
	}

	/**
	 * Emits the 'pingSent' event to all registered handlers.
	 * @param {number} [timestamp] - Optional timestamp when ping was sent
	 */
	public emitPingSent(timestamp?: number): void {
		this._pingSentHandlers.forEach((handler) => handler(timestamp));
	}

	/**
	 * Registers a handler for the 'pongReceived' event.
	 * @param {(timestamp?: number, rtt?: number) => void} handler - The handler function to register
	 */
	public addPongReceivedHandler(handler: (timestamp?: number, rtt?: number) => void): void {
		this._pongReceivedHandlers.add(handler);
	}

	/**
	 * Removes a previously registered 'pongReceived' event handler.
	 * @param {(timestamp?: number, rtt?: number) => void} handler - The handler function to remove
	 */
	public removePongReceivedHandler(handler: (timestamp?: number, rtt?: number) => void): void {
		this._pongReceivedHandlers.delete(handler);
	}

	/**
	 * Emits the 'pongReceived' event to all registered handlers.
	 * @param {number} [timestamp] - Optional original timestamp from the ping
	 * @param {number} [rtt] - Optional round-trip time in milliseconds
	 */
	public emitPongReceived(timestamp?: number, rtt?: number): void {
		this._pongReceivedHandlers.forEach((handler) => handler(timestamp, rtt));
	}

	/**
	 * Clears all registered event handlers.
	 */
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

/**
 * Internal manager for heartbeat/ping-pong mechanism to monitor connection health.
 * Handles periodic ping sending, pong response validation, and timeout detection.
 *
 * @template T - The TypeSocket configuration
 * @internal
 */
class HeartbeatManager<T extends TypeSocketApi> {
	private _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private _heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
	private _lastPongReceived: Date | null = null;
	private _lastRtt: number | null = null;

	/**
	 * Creates a new HeartbeatManager instance.
	 * @param _config - Heartbeat configuration
	 * @param {EventManager<T>} _eventManager - Event manager for emitting heartbeat events
	 * @param {() => WebSocket | null} _getConnection - Function to get the current WebSocket connection
	 * @param {() => TypeSocketConnectionState} _getConnectionState - Function to get the current connection state
	 * @param {() => void} _closeConnection - Function to close the connection on timeout
	 */
	constructor(
		private readonly _config: {
			enabled: boolean;
			interval: number;
			timeout: number;
			ping: string | undefined;
			pong: string | undefined;
			hasTimestamp: boolean;
		},
		private readonly _eventManager: EventManager<T>,
		private readonly _getConnection: () => WebSocket | null,
		private readonly _getConnectionState: () => TypeSocketConnectionState,
		private readonly _closeConnection: () => void,
	) {}

	/**
	 * Starts the heartbeat interval. Sends periodic pings according to the configured interval.
	 * Automatically stops any existing heartbeat before starting a new one.
	 */
	public start(): void {
		if (!this._config.enabled || !this._config.ping || !this._config.pong) return;

		this.stop();

		this._heartbeatInterval = setInterval(() => {
			this.sendHeartbeat();
		}, this._config.interval);
	}

	/**
	 * Stops the heartbeat interval and clears any pending timeout.
	 */
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

	/**
	 * Sends a single heartbeat ping message and starts the timeout timer.
	 * If the connection is not in CONNECTED state, does nothing.
	 * On send error, immediately triggers timeout handling.
	 */
	public sendHeartbeat(): void {
		if (!this._config.ping || !this._config.pong || this._getConnectionState() !== TypeSocketConnectionState.CONNECTED) return;

		const timestamp = this._config.hasTimestamp ? Date.now() : undefined;
		const pingData = timestamp !== undefined ? { timestamp } : {};

		try {
			this._getConnection()?.send(
				JSON.stringify({
					type: this._config.ping,
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

	/**
	 * Handles a received pong response.
	 * Clears the timeout, calculates round-trip time if timestamps are enabled, and emits the pongReceived event.
	 * @param {PongPayload} data - The pong payload data
	 */
	public handlePong(data: PongPayload): void {
		if (!this._config.ping || !this._config.pong) return;

		if (this._heartbeatTimeout) {
			clearTimeout(this._heartbeatTimeout);
			this._heartbeatTimeout = null;
		}

		let timestamp: number | undefined;
		let rtt: number | undefined;

		if (this._config.hasTimestamp && data.timestamp !== undefined) {
			timestamp = data.timestamp;
			rtt = Date.now() - timestamp;
			this._lastRtt = rtt;
		}

		this._lastPongReceived = new Date();

		this._eventManager.emitPongReceived(timestamp, rtt);
	}

	/**
	 * Called when a heartbeat timeout occurs (pong not received within timeout period).
	 * Emits the heartbeatTimeout event and closes the connection.
	 */
	public onTimeout(): void {
		this._eventManager.emitHeartbeatTimeout();
		this._closeConnection();
	}

	/**
	 * Gets the timestamp of the last received pong.
	 * @returns {Date | null} The timestamp when the last pong was received, or null if no pong has been received
	 */
	public get lastPongReceived(): Date | null {
		return this._lastPongReceived;
	}

	/**
	 * Gets the last calculated round-trip time.
	 * @returns {number | null} The last RTT in milliseconds, or null if not available
	 */
	public get lastRoundTripTime(): number | null {
		return this._lastRtt;
	}

	/**
	 * Resets the heartbeat manager state, clearing all timers and metrics.
	 */
	public reset(): void {
		this.stop();
		this._lastPongReceived = null;
		this._lastRtt = null;
	}
}

/**
 * Fluent API for registering event handlers on a TypeSocket client.
 * All methods return the client instance to allow method chaining.
 *
 * @template T - The TypeSocket configuration
 * @template C - The client configuration (optional)
 * @internal
 */
class OnHandlers<T extends TypeSocketApi, C extends TypeSocketClientConfig<T> = TypeSocketClientConfig<T>> {
	/**
	 * Creates a new OnHandlers instance.
	 * @param {EventManager<T>} _eventManager - Event manager for registering handlers
	 * @param {TypeSocketClient<T, C>} _client - The client instance to return for method chaining
	 */
	constructor(
		private readonly _eventManager: EventManager<T>,
		private readonly _client: TypeSocketClient<T, C>,
	) {}

	/**
	 * Registers a handler for the 'connected' event.
	 * @param {() => void} handler - The handler to call when connected
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 */
	public connected(handler: () => void): TypeSocketClient<T, C> {
		this._eventManager.addConnectedHandler(handler);
		return this._client;
	}

	/**
	 * Registers a handler for the 'disconnected' event.
	 * @param {(info: DisconnectInfo) => void} handler - The handler to call when disconnected
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 */
	public disconnected(handler: (info: DisconnectInfo) => void): TypeSocketClient<T, C> {
		this._eventManager.addDisconnectedHandler(handler);
		return this._client;
	}

	/**
	 * Registers a handler for the 'error' event.
	 * @param {(error: TypeSocketError) => void} handler - The handler to call when an error occurs
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 */
	public error(handler: (error: TypeSocketError) => void): TypeSocketClient<T, C> {
		this._eventManager.addErrorHandler(handler);
		return this._client;
	}

	/**
	 * Registers a handler for a specific message type.
	 * @template K - The message type
	 * @param {K} messageType - The type of message to handle
	 * @param {(data: ExtractReceivedPayloadType<T, K>) => void} handler - The handler to call when this message type is received
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 */
	public message<K extends ExtractReceivableMessageTypes<T>>(messageType: K, handler: (data: ExtractReceivedPayloadType<T, K>) => void): TypeSocketClient<T, C> {
		this._eventManager.addMessageHandler(messageType, handler);
		return this._client;
	}

	/**
	 * Registers a handler for the 'beforeReconnect' event.
	 *
	 * **Availability**: This method is only available when reconnection is enabled in the client configuration.
	 * When reconnection is disabled (`reconnection: { enabled: false }`), this method will not be callable
	 * at compile-time, ensuring type safety.
	 *
	 * **Why**: If reconnection is disabled, the beforeReconnect event will never be emitted, making it
	 * unnecessary to register handlers for it. TypeScript enforces this at compile-time to prevent
	 * registering handlers that will never be called.
	 *
	 * @param {(info: ReconnectAttemptInfo) => void} handler - The handler to call before reconnection attempts
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 *
	 * @example
	 * ```typescript
	 * // ✓ Available when reconnection is enabled
	 * const client = new TypeSocketClient<MyApi, { reconnection: { enabled: true } }>(url, {
	 *   reconnection: { enabled: true }
	 * });
	 * client.on.beforeReconnect((info) => {
	 *   console.log(`Reconnecting (attempt ${info.attempt}/${info.maxRetries})`);
	 * });
	 *
	 * // ✗ Not available when reconnection is disabled
	 * const client2 = new TypeSocketClient<MyApi, { reconnection: { enabled: false } }>(url, {
	 *   reconnection: { enabled: false }
	 * });
	 * client2.on.beforeReconnect(...); // TypeScript error
	 * ```
	 */
	public beforeReconnect(this: IsReconnectionEnabled<C> extends true ? this : never, handler: (info: ReconnectAttemptInfo) => void): TypeSocketClient<T, C> {
		this._eventManager.addBeforeReconnectHandler(handler);
		return this._client;
	}

	/**
	 * Registers a handler for the 'queueFull' event.
	 *
	 * **Availability**: This method is only available when the message queue is enabled in the client configuration.
	 * When the queue is disabled (`messageQueue: { enabled: false }`), this method will not be callable
	 * at compile-time, ensuring type safety.
	 *
	 * **Why**: If the message queue is disabled, the queueFull event will never be emitted since messages
	 * are not queued. TypeScript enforces this at compile-time to prevent registering handlers that will
	 * never be called.
	 *
	 * @param {(info: QueueFullInfo) => void} handler - The handler to call when the queue becomes full
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 *
	 * @example
	 * ```typescript
	 * // ✓ Available when queue is enabled (default)
	 * const client = new TypeSocketClient<MyApi>(url);
	 * client.on.queueFull((info) => {
	 *   console.log(`Queue full: ${info.currentSize}/${info.maxSize}`);
	 * });
	 *
	 * // ✗ Not available when queue is disabled
	 * const client2 = new TypeSocketClient<MyApi, { messageQueue: { enabled: false } }>(url, {
	 *   messageQueue: { enabled: false }
	 * });
	 * client2.on.queueFull(...); // TypeScript error
	 * ```
	 */
	public queueFull(this: IsQueueEnabled<C> extends true ? this : never, handler: (info: QueueFullInfo) => void): TypeSocketClient<T, C> {
		this._eventManager.addQueueFullHandler(handler);
		return this._client;
	}

	/**
	 * Registers a handler for the 'heartbeatTimeout' event.
	 *
	 * **Availability**: This method is only available when heartbeat is enabled in the client configuration.
	 * When heartbeat is disabled (`heartbeat: { enabled: false }`), this method will not be callable
	 * at compile-time, ensuring type safety.
	 *
	 * **Why**: If heartbeat is disabled, the heartbeatTimeout event will never be emitted since ping/pong
	 * messages are not sent. TypeScript enforces this at compile-time to prevent registering handlers
	 * that will never be called.
	 *
	 * @param {() => void} handler - The handler to call when a heartbeat timeout occurs
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 *
	 * @example
	 * ```typescript
	 * // ✓ Available when heartbeat is enabled
	 * const client = new TypeSocketClient<MyApi, { heartbeat: { enabled: true; ping: 'ping'; pong: 'pong' } }>(url, {
	 *   heartbeat: { enabled: true, ping: 'ping', pong: 'pong' }
	 * });
	 * client.on.heartbeatTimeout(() => {
	 *   console.log('Connection lost - no pong received');
	 * });
	 *
	 * // ✗ Not available when heartbeat is disabled
	 * const client2 = new TypeSocketClient<MyApi>(url); // heartbeat disabled by default
	 * client2.on.heartbeatTimeout(...); // TypeScript error
	 * ```
	 */
	public heartbeatTimeout(this: IsHeartbeatEnabled<C> extends true ? this : never, handler: () => void): TypeSocketClient<T, C> {
		this._eventManager.addHeartbeatTimeoutHandler(handler);
		return this._client;
	}

	/**
	 * Registers a handler for the 'pingSent' event.
	 *
	 * **Availability**: This method is only available when heartbeat is enabled in the client configuration.
	 * When heartbeat is disabled (`heartbeat: { enabled: false }`), this method will not be callable
	 * at compile-time, ensuring type safety.
	 *
	 * **Why**: If heartbeat is disabled, ping messages are never sent, making this event irrelevant.
	 * TypeScript enforces this at compile-time to prevent registering handlers that will never be called.
	 *
	 * @param {(timestamp?: number) => void} handler - The handler to call when a ping is sent.
	 *                                                   If `hasTimestamp` is true, timestamp will be provided.
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 *
	 * @example
	 * ```typescript
	 * // ✓ Available when heartbeat is enabled
	 * const client = new TypeSocketClient<MyApi, { heartbeat: { enabled: true; ping: 'ping'; pong: 'pong'; hasTimestamp: true } }>(url, {
	 *   heartbeat: { enabled: true, ping: 'ping', pong: 'pong', hasTimestamp: true }
	 * });
	 * client.on.pingSent((timestamp) => {
	 *   console.log(`Ping sent at ${timestamp}`);
	 * });
	 * ```
	 */
	public pingSent(this: IsHeartbeatEnabled<C> extends true ? this : never, handler: (timestamp?: number) => void): TypeSocketClient<T, C> {
		this._eventManager.addPingSentHandler(handler);
		return this._client;
	}

	/**
	 * Registers a handler for the 'pongReceived' event.
	 *
	 * **Availability**: This method is only available when heartbeat is enabled in the client configuration.
	 * When heartbeat is disabled (`heartbeat: { enabled: false }`), this method will not be callable
	 * at compile-time, ensuring type safety.
	 *
	 * **Why**: If heartbeat is disabled, pong messages are never received, making this event irrelevant.
	 * TypeScript enforces this at compile-time to prevent registering handlers that will never be called.
	 *
	 * @param {(timestamp?: number, rtt?: number) => void} handler - The handler to call when a pong is received.
	 *                                                                If `hasTimestamp` is true, timestamp and RTT will be provided.
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 *
	 * @example
	 * ```typescript
	 * // ✓ Available when heartbeat is enabled with timestamps
	 * const client = new TypeSocketClient<MyApi, { heartbeat: { enabled: true; ping: 'ping'; pong: 'pong'; hasTimestamp: true } }>(url, {
	 *   heartbeat: { enabled: true, ping: 'ping', pong: 'pong', hasTimestamp: true }
	 * });
	 * client.on.pongReceived((timestamp, rtt) => {
	 *   console.log(`Pong received! RTT: ${rtt}ms`);
	 * });
	 * ```
	 */
	public pongReceived(this: IsHeartbeatEnabled<C> extends true ? this : never, handler: (timestamp?: number, rtt?: number) => void): TypeSocketClient<T, C> {
		this._eventManager.addPongReceivedHandler(handler);
		return this._client;
	}
}

/**
 * Fluent API for unregistering event handlers from a TypeSocket client.
 * All methods return the client instance to allow method chaining.
 *
 * @template T - The TypeSocket configuration
 * @template C - The client configuration (optional)
 * @internal
 */
class OffHandlers<T extends TypeSocketApi, C extends TypeSocketClientConfig<T> = TypeSocketClientConfig<T>> {
	/**
	 * Creates a new OffHandlers instance.
	 * @param {EventManager<T>} _eventManager - Event manager for unregistering handlers
	 * @param {TypeSocketClient<T, C>} _client - The client instance to return for method chaining
	 */
	constructor(
		private readonly _eventManager: EventManager<T>,
		private readonly _client: TypeSocketClient<T, C>,
	) {}

	/**
	 * Unregisters a handler for the 'connected' event.
	 * @param {() => void} handler - The handler to remove
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 */
	public connected(handler: () => void): TypeSocketClient<T, C> {
		this._eventManager.removeConnectedHandler(handler);
		return this._client;
	}

	/**
	 * Unregisters a handler for the 'disconnected' event.
	 * @param {(info: DisconnectInfo) => void} handler - The handler to remove
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 */
	public disconnected(handler: (info: DisconnectInfo) => void): TypeSocketClient<T, C> {
		this._eventManager.removeDisconnectedHandler(handler);
		return this._client;
	}

	/**
	 * Unregisters a handler for the 'error' event.
	 * @param {(error: TypeSocketError) => void} handler - The handler to remove
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 */
	public error(handler: (error: TypeSocketError) => void): TypeSocketClient<T, C> {
		this._eventManager.removeErrorHandler(handler);
		return this._client;
	}

	/**
	 * Unregisters a handler for a specific message type.
	 * @template K - The message type
	 * @param {K} messageType - The type of message to remove handler for
	 * @param {(data: ExtractReceivedPayloadType<T, K>) => void} handler - The handler to remove
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 */
	public message<K extends ExtractReceivableMessageTypes<T>>(messageType: K, handler: (data: ExtractReceivedPayloadType<T, K>) => void): TypeSocketClient<T, C> {
		this._eventManager.removeMessageHandler(messageType, handler);
		return this._client;
	}

	/**
	 * Unregisters a handler for the 'beforeReconnect' event.
	 *
	 * **Availability**: This method is only available when reconnection is enabled in the client configuration.
	 * When reconnection is disabled, this method will not be callable at compile-time.
	 *
	 * @param {(info: ReconnectAttemptInfo) => void} handler - The handler to remove
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 */
	public beforeReconnect(this: IsReconnectionEnabled<C> extends true ? this : never, handler: (info: ReconnectAttemptInfo) => void): TypeSocketClient<T, C> {
		this._eventManager.removeBeforeReconnectHandler(handler);
		return this._client;
	}

	/**
	 * Unregisters a handler for the 'queueFull' event.
	 *
	 * **Availability**: This method is only available when the message queue is enabled in the client configuration.
	 * When the queue is disabled, this method will not be callable at compile-time.
	 *
	 * @param {(info: QueueFullInfo) => void} handler - The handler to remove
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 */
	public queueFull(this: IsQueueEnabled<C> extends true ? this : never, handler: (info: QueueFullInfo) => void): TypeSocketClient<T, C> {
		this._eventManager.removeQueueFullHandler(handler);
		return this._client;
	}

	/**
	 * Unregisters a handler for the 'heartbeatTimeout' event.
	 *
	 * **Availability**: This method is only available when heartbeat is enabled in the client configuration.
	 * When heartbeat is disabled, this method will not be callable at compile-time.
	 *
	 * @param {() => void} handler - The handler to remove
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 */
	public heartbeatTimeout(this: IsHeartbeatEnabled<C> extends true ? this : never, handler: () => void): TypeSocketClient<T, C> {
		this._eventManager.removeHeartbeatTimeoutHandler(handler);
		return this._client;
	}

	/**
	 * Unregisters a handler for the 'pingSent' event.
	 *
	 * **Availability**: This method is only available when heartbeat is enabled in the client configuration.
	 * When heartbeat is disabled, this method will not be callable at compile-time.
	 *
	 * @param {(timestamp?: number) => void} handler - The handler to remove
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 */
	public pingSent(this: IsHeartbeatEnabled<C> extends true ? this : never, handler: (timestamp?: number) => void): TypeSocketClient<T, C> {
		this._eventManager.removePingSentHandler(handler);
		return this._client;
	}

	/**
	 * Unregisters a handler for the 'pongReceived' event.
	 *
	 * **Availability**: This method is only available when heartbeat is enabled in the client configuration.
	 * When heartbeat is disabled, this method will not be callable at compile-time.
	 *
	 * @param {(timestamp?: number, rtt?: number) => void} handler - The handler to remove
	 * @returns {TypeSocketClient<T, C>} The client instance for chaining
	 */
	public pongReceived(this: IsHeartbeatEnabled<C> extends true ? this : never, handler: (timestamp?: number, rtt?: number) => void): TypeSocketClient<T, C> {
		this._eventManager.removePongReceivedHandler(handler);
		return this._client;
	}
}

/**
 * Internal manager for queuing messages when the connection is not available.
 * Handles message queuing, overflow strategies, and flushing queued messages when connected.
 *
 * @template T - The TypeSocket configuration
 * @internal
 */
class QueueManager<T extends TypeSocketApi> {
	private _messageQueue: Array<{ type: ExtractSendableMessageTypes<T>; data: unknown }> = [];

	/**
	 * Creates a new QueueManager instance.
	 * @param {Required<MessageQueueConfig>} _config - Message queue configuration with all required fields
	 * @param {EventManager<T>} _eventManager - Event manager for emitting queue events
	 * @param {() => WebSocket | null} _getConnection - Function to get the current WebSocket connection
	 * @param {() => TypeSocketConnectionState} _getConnectionState - Function to get the current connection state
	 */
	constructor(
		private readonly _config: Required<MessageQueueConfig>,
		private readonly _eventManager: EventManager<T>,
		private readonly _getConnection: () => WebSocket | null,
		private readonly _getConnectionState: () => TypeSocketConnectionState,
	) {}

	/**
	 * Checks if the queue is enabled.
	 * @returns {boolean} True if queue is enabled, false otherwise
	 */
	public get isEnabled(): boolean {
		return this._config.enabled;
	}

	/**
	 * Gets the current number of messages in the queue.
	 * @returns {number} The queue size
	 */
	public get size(): number {
		return this._messageQueue.length;
	}

	/**
	 * Gets a readonly copy of all queued messages.
	 * @returns {ReadonlyArray} Array of queued messages
	 */
	public get messages(): ReadonlyArray<{ type: ExtractSendableMessageTypes<T>; data: unknown }> {
		return [...this._messageQueue];
	}

	/**
	 * Clears all messages from the queue.
	 */
	public clear(): void {
		this._messageQueue = [];
	}

	/**
	 * Adds a message to the queue.
	 * If the queue is full, applies the configured overflow strategy.
	 * @template K - The message type
	 * @param {K} type - The message type
	 * @param {ExtractSentPayloadType<T, K>} data - The message payload
	 * @returns {boolean} True if the message was queued successfully, false otherwise
	 */
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

	/**
	 * Attempts to send all queued messages when the connection is in CONNECTED state.
	 * Stops flushing on first send error and re-queues the failed message.
	 */
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

	/**
	 * Resets the queue manager by clearing all queued messages.
	 */
	public reset(): void {
		this._messageQueue = [];
	}
}

/**
 * Provides read-only access to TypeSocket client metrics and state information.
 * Aggregates data from various internal managers for monitoring and debugging.
 *
 * @template T - The TypeSocket configuration
 * @internal
 */
class MetricsManager<T extends TypeSocketApi> {
	/**
	 * Creates a new MetricsManager instance.
	 * @param {() => TypeSocketConnectionState} _getConnectionState - Function to get the current connection state
	 * @param {ReconnectionManager<T>} _reconnectionManager - Reconnection manager instance
	 * @param {HeartbeatManager<T>} _heartbeatManager - Heartbeat manager instance
	 * @param {QueueManager<T>} _queueManager - Queue manager instance
	 */
	constructor(
		private readonly _getConnectionState: () => TypeSocketConnectionState,
		private readonly _reconnectionManager: ReconnectionManager<T>,
		private readonly _heartbeatManager: HeartbeatManager<T>,
		private readonly _queueManager: QueueManager<T>,
	) {}

	/**
	 * Gets the current connection state.
	 * @returns {TypeSocketConnectionState} The current connection state
	 */
	public get connectionState(): TypeSocketConnectionState {
		return this._getConnectionState();
	}

	/**
	 * Gets the current number of reconnection attempts.
	 * @returns {number} Number of reconnection attempts made
	 */
	public get reconnectionAttempts(): number {
		return this._reconnectionManager.attempts;
	}

	/**
	 * Checks if a reconnection is currently in progress.
	 * @returns {boolean} True if reconnecting, false otherwise
	 */
	public get isReconnecting(): boolean {
		return this._reconnectionManager.isReconnecting;
	}

	/**
	 * Gets the timestamp of the last received pong.
	 * @returns {Date | null} The last pong timestamp, or null if none received
	 */
	public get lastPongReceived(): Date | null {
		return this._heartbeatManager.lastPongReceived;
	}

	/**
	 * Gets the last calculated round-trip time.
	 * @returns {number | null} The last RTT in milliseconds, or null if not available
	 */
	public get lastRoundTripTime(): number | null {
		return this._heartbeatManager.lastRoundTripTime;
	}

	/**
	 * Gets the current message queue size.
	 * @returns {number} Number of messages in the queue
	 */
	public get queueSize(): number {
		return this._queueManager.size;
	}
}

/**
 * Internal manager for automatic reconnection with exponential backoff.
 * Handles scheduling reconnection attempts and managing reconnection state.
 *
 * @template T - The TypeSocket configuration
 * @internal
 */
class ReconnectionManager<T extends TypeSocketApi> {
	private _reconnectionAttempts = 0;
	private _reconnectionTimeout: ReturnType<typeof setTimeout> | null = null;
	private _intentionalDisconnect = false;

	/**
	 * Creates a new ReconnectionManager instance.
	 * @param {Required<ReconnectionConfig>} _config - Reconnection configuration with all required fields
	 * @param {EventManager<T>} _eventManager - Event manager for emitting reconnection events
	 * @param {() => void} _connect - Function to initiate a connection
	 * @param {TypeSocketClient<T>} _client - The client instance for fluent API chaining
	 */
	constructor(
		private readonly _config: Required<ReconnectionConfig>,
		private readonly _eventManager: EventManager<T>,
		private readonly _connect: () => void,
		private readonly _client: TypeSocketClient<T>,
	) {}

	/**
	 * Gets the current number of reconnection attempts.
	 * @returns {number} Number of attempts made
	 */
	public get attempts(): number {
		return this._reconnectionAttempts;
	}

	/**
	 * Checks if a reconnection is currently scheduled.
	 * @returns {boolean} True if a reconnection timeout is pending, false otherwise
	 */
	public get isReconnecting(): boolean {
		return this._reconnectionTimeout !== null;
	}

	/**
	 * Enables automatic reconnection.
	 * @returns {TypeSocketClient<T>} The client instance for chaining
	 */
	public enable(): TypeSocketClient<T> {
		this._config.enabled = true;
		return this._client;
	}

	/**
	 * Disables automatic reconnection and cancels any pending reconnection.
	 * @returns {TypeSocketClient<T>} The client instance for chaining
	 */
	public disable(): TypeSocketClient<T> {
		this._config.enabled = false;
		this.cancel();
		return this._client;
	}

	/**
	 * Schedules a reconnection attempt with exponential backoff.
	 * Does nothing if reconnection is disabled, max retries reached, or disconnect was intentional.
	 */
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

	/**
	 * Cancels any pending reconnection timeout.
	 */
	public cancel(): void {
		if (this._reconnectionTimeout) {
			clearTimeout(this._reconnectionTimeout);
			this._reconnectionTimeout = null;
		}
	}

	/**
	 * Called when successfully connected. Resets attempt counter and cancels any pending reconnection.
	 */
	public onConnected(): void {
		this._reconnectionAttempts = 0;
		this.cancel();
	}

	/**
	 * Marks the current disconnection as intentional, preventing automatic reconnection.
	 */
	public markIntentionalDisconnect(): void {
		this._intentionalDisconnect = true;
	}

	/**
	 * Resets the reconnection manager state.
	 */
	public reset(): void {
		this._reconnectionAttempts = 0;
		this._intentionalDisconnect = false;
		this.cancel();
	}
}

/**
 * TypeSocket WebSocket client with type-safe message handling.
 * Provides features like automatic reconnection, message queuing, heartbeat monitoring, and comprehensive event handling.
 *
 * @template T - The TypeSocket configuration defining message types and their payloads
 * @template C - Optional client configuration for reconnection, queue, and heartbeat settings
 *
 * @example
 * ```typescript
 * interface MySocketApi extends TypeSocketApi {
 *   messages: {
 *     greeting: { duplex: { text: string } };
 *     notification: { received: { message: string } };
 *   };
 * }
 *
 * const client = new TypeSocketClient<MySocketApi>('ws://localhost:8080', {
 *   heartbeat: { enabled: true, ping: 'ping', pong: 'pong', hasTimestamp: true }
 * });
 * client.on.connected(() => console.log('Connected!'));
 * client.on.message('notification', (data) => console.log(data.message));
 * client.connect();
 * ```
 */
export default class TypeSocketClient<T extends TypeSocketApi, C extends TypeSocketClientConfig<T> = TypeSocketClientConfig<T>> {
	private readonly _url: URL;
	private readonly _eventManager: EventManager<T>;
	private readonly _heartbeatManager: HeartbeatManager<T>;
	private readonly _queueManager: QueueManager<T>;
	private readonly _reconnectionManager: ReconnectionManager<T>;
	private _connection: WebSocket | null = null;
	private _isDestroyed = false;

	/** Fluent API for registering event handlers */
	public readonly on: OnHandlers<T, C>;
	/** Fluent API for unregistering event handlers */
	public readonly off: OffHandlers<T, C>;

	/**
	 * Queue manager for inspecting and controlling the message queue.
	 *
	 * **Availability**: Only accessible when the message queue is enabled (default).
	 * When disabled (`messageQueue: { enabled: false }`), accessing this property or its methods
	 * will result in compile-time TypeScript errors.
	 *
	 * **Why**: When the queue is disabled, messages are not queued, making queue operations
	 * meaningless. TypeScript prevents accessing this property to ensure type safety.
	 *
	 * @example
	 * ```typescript
	 * // ✓ Available when queue is enabled (default)
	 * const client = new TypeSocketClient<MyApi>(url);
	 * console.log(client.queue.size); // OK
	 * client.queue.clear(); // OK
	 *
	 * // ✗ Not available when queue is disabled
	 * const client2 = new TypeSocketClient<MyApi, { messageQueue: { enabled: false } }>(url, {
	 *   messageQueue: { enabled: false }
	 * });
	 * client2.queue.size; // TypeScript error: Property 'size' does not exist on type 'never'
	 * ```
	 */
	public readonly queue: IsQueueEnabled<C> extends true ? QueueManager<T> : never;

	/** Metrics for monitoring client state */
	public readonly metrics: MetricsManager<T>;

	/**
	 * Reconnection manager for controlling automatic reconnection behavior.
	 *
	 * **Availability**: Only accessible when reconnection is enabled (default).
	 * When disabled (`reconnection: { enabled: false }`), accessing this property or its methods
	 * will result in compile-time TypeScript errors.
	 *
	 * **Why**: When reconnection is disabled, reconnection operations are meaningless.
	 * TypeScript prevents accessing this property to ensure type safety.
	 *
	 * @example
	 * ```typescript
	 * // ✓ Available when reconnection is enabled (default)
	 * const client = new TypeSocketClient<MyApi>(url);
	 * console.log(client.reconnection.attempts); // OK
	 * client.reconnection.disable(); // OK
	 *
	 * // ✗ Not available when reconnection is disabled
	 * const client2 = new TypeSocketClient<MyApi, { reconnection: { enabled: false } }>(url, {
	 *   reconnection: { enabled: false }
	 * });
	 * client2.reconnection.attempts; // TypeScript error: Property 'attempts' does not exist on type 'never'
	 * ```
	 */
	public readonly reconnection: IsReconnectionEnabled<C> extends true ? ReconnectionManager<T> : never;

	public constructor(url: URL | string, config?: C) {
		this._url = typeof url === 'string' ? new URL(url) : url;

		this._eventManager = new EventManager<T>();

		// Type-safe heartbeat config - validates at input level
		const hbConfig: HeartbeatConfig<T> | undefined = config?.heartbeat;

		this._heartbeatManager = new HeartbeatManager<T>(
			{
				enabled: hbConfig?.enabled ?? false,
				interval: hbConfig?.interval ?? 30000,
				timeout: hbConfig?.timeout ?? 5000,
				ping: hbConfig?.ping as string | undefined,
				pong: hbConfig?.pong as string | undefined,
				hasTimestamp: (hbConfig?.hasTimestamp ?? false) as boolean,
			},
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

	/**
	 * Gets the current connection state.
	 * Maps the underlying WebSocket readyState to TypeSocketConnectionState.
	 *
	 * @returns {TypeSocketConnectionState} The current connection state
	 */
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

	/**
	 * Initiates a connection to the WebSocket server.
	 * If already connected, disconnects first. Resets reconnection state.
	 */
	public connect() {
		if (this._connection) this.disconnect(true);
		this._reconnectionManager.reset();
		this._connection = new WebSocket(this._url);
		this._setHandlersToConnection();
	}

	/**
	 * Sends a typed message to the server.
	 * If not connected and queue is enabled, the message will be queued.
	 *
	 * @template K - The message type to send
	 * @param {K} type - The message type identifier
	 * @param {ExtractSentPayloadType<T, K>} data - The message payload
	 * @returns {boolean} True if sent or queued successfully, false otherwise
	 */
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

	/**
	 * Internal method to emit an error through the event manager.
	 * @param {TypeSocketError} error - The error to emit
	 * @private
	 */
	private _emitError(error: TypeSocketError): void {
		this._eventManager.emitError(error);
	}

	/**
	 * Internal method to set WebSocket event handlers on the connection.
	 * Can optionally configure which handlers to set.
	 * @param {Object} [handlers] - Optional configuration for which handlers to set
	 * @private
	 */
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

					// Check if this is a heartbeat pong message
					const pongType = this._heartbeatManager['_config'].pong;
					if (pongType && payload.type === pongType) {
						this._heartbeatManager.handlePong(payload.data as PongPayload);
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

	/**
	 * Disconnects from the WebSocket server.
	 * Marks the disconnect as intentional to prevent automatic reconnection.
	 *
	 * @param {true} [reset] - If true, fully resets the client state and destroys the instance
	 */
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
