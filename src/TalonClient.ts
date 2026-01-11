import type {
  TalonTransport,
  TalonClientOptions,
  OutboundMessage,
  InboundMessage,
  EventHandler,
  TransportState,
} from './types';

/**
 * TalonClient - Bidirectional event delivery client
 * 
 * Features:
 * - Send events TO the edge
 * - Receive updates FROM the edge
 * - Transport-agnostic (WebSocket, Webhook, etc.)
 * - Event emitter pattern for edge responses
 * 
 * @example
 * ```typescript
 * import { TalonClient } from '@sygnl/talon';
 * import { WebSocketTransport } from '@sygnl/talon/transports';
 * 
 * const talon = new TalonClient({
 *   transport: new WebSocketTransport('wss://edge.sygnl.io')
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
export class TalonClient {
  private transport: TalonTransport;
  private eventHandlers: Map<string, Set<EventHandler>>;
  private messageUnsubscribe?: () => void;
  private stateUnsubscribe?: () => void;
  private errorUnsubscribe?: () => void;
  private debug: boolean;

  constructor(options: TalonClientOptions) {
    this.transport = options.transport;
    this.eventHandlers = new Map();
    this.debug = options.debug ?? false;

    // Subscribe to transport messages
    this.messageUnsubscribe = this.transport.onMessage(this.handleMessage.bind(this));
    this.stateUnsubscribe = this.transport.onStateChange(this.handleStateChange.bind(this));
    this.errorUnsubscribe = this.transport.onError(this.handleError.bind(this));

    // Auto-connect if requested
    if (options.autoConnect !== false) {
      this.connect().catch((error) => {
        this.log('Auto-connect failed:', error);
      });
    }
  }

  /**
   * Connect to the edge
   */
  public async connect(): Promise<void> {
    return this.transport.connect();
  }

  /**
   * Disconnect from the edge
   */
  public disconnect(): void {
    this.transport.disconnect();
    this.cleanup();
  }

  /**
   * Send event TO the edge
   * 
   * @param event - Event data to send
   * @returns Promise that resolves when sent
   * 
   * @example
   * ```typescript
   * await talon.send({
   *   event: 'add_to_cart',
   *   product_id: 'prod_123',
   *   price: 99.99
   * });
   * ```
   */
  public async send(event: Record<string, unknown>): Promise<void> {
    const message: OutboundMessage = {
      type: 'event',
      data: event,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    this.log('Sending message:', message);
    return this.transport.send(message);
  }

  /**
   * Subscribe to events FROM the edge
   * 
   * @param eventType - Event type to listen for
   * @param handler - Function to call when event received
   * @returns Unsubscribe function
   * 
   * @example
   * ```typescript
   * const unsubscribe = talon.on('attribution_updated', (data) => {
   *   console.log('Attribution:', data);
   * });
   * 
   * // Later: unsubscribe()
   * ```
   */
  public on<T = any>(eventType: string, handler: EventHandler<T>): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }

    this.eventHandlers.get(eventType)!.add(handler);
    this.log(`Subscribed to event: ${eventType}`);

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(eventType);
        }
      }
      this.log(`Unsubscribed from event: ${eventType}`);
    };
  }

  /**
   * Subscribe to event once (auto-unsubscribe after first call)
   */
  public once<T = any>(eventType: string, handler: EventHandler<T>): () => void {
    const wrappedHandler = (data: T) => {
      handler(data);
      unsubscribe();
    };

    const unsubscribe = this.on(eventType, wrappedHandler);
    return unsubscribe;
  }

  /**
   * Remove all handlers for an event type
   */
  public off(eventType: string): void {
    this.eventHandlers.delete(eventType);
    this.log(`Removed all handlers for: ${eventType}`);
  }

  /**
   * Get current connection state
   */
  public get state(): TransportState {
    return this.transport.state;
  }

  /**
   * Check if connected
   */
  public get connected(): boolean {
    return this.transport.state === 'connected';
  }

  /**
   * Handle incoming message from transport
   */
  private handleMessage(message: InboundMessage): void {
    this.log('Received message:', message);

    const handlers = this.eventHandlers.get(message.type);
    if (handlers && handlers.size > 0) {
      handlers.forEach((handler) => {
        try {
          handler(message.data);
        } catch (error) {
          this.log(`Error in handler for ${message.type}:`, error);
        }
      });
    } else {
      this.log(`No handlers for message type: ${message.type}`);
    }
  }

  /**
   * Handle transport state change
   */
  private handleStateChange(state: TransportState): void {
    this.log(`State changed: ${state}`);
    
    // Emit state change event
    const handlers = this.eventHandlers.get('_state_change');
    if (handlers) {
      handlers.forEach((handler) => handler({ state }));
    }
  }

  /**
   * Handle transport error
   */
  private handleError(error: Error): void {
    this.log('Transport error:', error);
    
    // Emit error event
    const handlers = this.eventHandlers.get('_error');
    if (handlers) {
      handlers.forEach((handler) => handler({ error }));
    }
  }

  /**
   * Cleanup subscriptions
   */
  private cleanup(): void {
    this.messageUnsubscribe?.();
    this.stateUnsubscribe?.();
    this.errorUnsubscribe?.();
    this.eventHandlers.clear();
  }

  /**
   * Generate unique message ID
   */
  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Debug logging
   */
  private log(message: string, data?: unknown): void {
    if (this.debug && typeof console !== 'undefined') {
      console.log(`[TalonClient] ${message}`, data || '');
    }
  }
}
