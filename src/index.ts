/**
 * @sygnl/talon
 * 
 * Bidirectional event delivery client for Sygnl Edge
 * 
 * Features:
 * - Send events TO the edge
 * - Receive updates FROM the edge
 * - Transport-agnostic (WebSocket, Webhook, etc.)
 * - Real-time bidirectional communication
 * 
 * @example
 * ```typescript
 * import { TalonClient } from '@sygnl/talon';
 * import { WebSocketTransport } from '@sygnl/talon/transports';
 * 
 * // Browser - bidirectional
 * const talon = new TalonClient({
 *   transport: new WebSocketTransport({ url: 'wss://edge.sygnl.io' })
 * });
 * 
 * // Send event TO edge
 * await talon.send({ event: 'add_to_cart', product_id: 'abc' });
 * 
 * // Receive updates FROM edge
 * talon.on('attribution_updated', (data) => {
 *   console.log('Attribution:', data);
 * });
 * ```
 */

export { TalonClient } from './TalonClient';

export type {
  TalonTransport,
  TalonClientOptions,
  OutboundMessage,
  InboundMessage,
  TransportState,
  EventHandler,
} from './types';
