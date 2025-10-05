/**
 * @module typesocket
 * @description TypeSocket - Type-safe WebSocket client with automatic reconnection, message queuing, and heartbeat monitoring.
 *
 * @example
 * ```typescript
 * import { TypeSocketClient } from 'typesocket';
 *
 * const config = {
 *   messages: {
 *     greeting: { duplex: { text: string } },
 *     notification: { received: { message: string } }
 *   }
 * };
 *
 * const client = new TypeSocketClient('ws://localhost:8080', config);
 * client.on.connected(() => console.log('Connected!'));
 * client.connect();
 * ```
 */

/** The main TypeSocket WebSocket client class */
export { default as TypeSocketClient } from './client.js';

/** All TypeSocket type definitions and interfaces */
export type * as TypeSocketClientTypes from './types.js';
