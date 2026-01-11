import type {
  TalonTransport,
  OutboundMessage,
  InboundMessage,
  TransportState,
} from '../types';

/**
 * WebSocket transport options
 */
export interface WebSocketTransportOptions {
  /** WebSocket URL */
  url: string;
  
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  
  /** Reconnect delay in ms */
  reconnectDelay?: number;
  
  /** Max reconnect attempts (0 = infinite) */
  maxReconnectAttempts?: number;
  
  /** Connection timeout in ms */
  connectionTimeout?: number;
  
  /** Debug mode */
  debug?: boolean;
}

/**
 * WebSocket transport for bidirectional communication
 * 
 * Features:
 * - Real-time bidirectional communication
 * - Auto-reconnect with exponential backoff
 * - Connection state management
 * - Message queuing during disconnection
 * 
 * @example
 * ```typescript
 * const transport = new WebSocketTransport({
 *   url: 'wss://edge.sygnl.io',
 *   autoReconnect: true
 * });
 * ```
 */
export class WebSocketTransport implements TalonTransport {
  private url: string;
  private ws: WebSocket | null = null;
  private _state: TransportState = 'disconnected';
  private autoReconnect: boolean;
  private reconnectDelay: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeout: number;
  private debug: boolean;
  
  private messageHandlers = new Set<(message: InboundMessage) => void>();
  private stateHandlers = new Set<(state: TransportState) => void>();
  private errorHandlers = new Set<(error: Error) => void>();
  private messageQueue: OutboundMessage[] = [];

  constructor(options: WebSocketTransportOptions) {
    this.url = options.url;
    this.autoReconnect = options.autoReconnect ?? true;
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 0; // 0 = infinite
    this.connectionTimeout = options.connectionTimeout ?? 10000;
    this.debug = options.debug ?? false;
  }

  public get state(): TransportState {
    return this._state;
  }

  public async connect(): Promise<void> {
    if (this._state === 'connected' || this._state === 'connecting') {
      this.log('Already connected or connecting');
      return;
    }

    this.setState('connecting');
    this.log(`Connecting to ${this.url}`);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
          this.ws?.close();
        }, this.connectionTimeout);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.setState('connected');
          this.reconnectAttempts = 0;
          this.log('Connected');
          
          // Flush queued messages
          this.flushMessageQueue();
          
          resolve();
        };

        this.ws.onerror = () => {
          clearTimeout(timeout);
          const error = new Error('WebSocket connection error');
          this.log('Connection error:', error);
          this.emitError(error);
          reject(error);
        };

        this.ws.onclose = () => {
          clearTimeout(timeout);
          this.handleDisconnect();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        this.setState('error');
        const err = error instanceof Error ? error : new Error('Unknown error');
        this.emitError(err);
        reject(err);
      }
    });
  }

  public disconnect(): void {
    this.log('Disconnecting');
    this.autoReconnect = false; // Disable auto-reconnect on manual disconnect
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('disconnected');
  }

  public async send(message: OutboundMessage): Promise<void> {
    if (this._state !== 'connected' || !this.ws) {
      // Queue message if not connected
      this.log('Not connected, queueing message');
      this.messageQueue.push(message);
      return;
    }

    try {
      const payload = JSON.stringify(message);
      this.ws.send(payload);
      this.log('Sent message:', message);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Send failed');
      this.log('Send error:', err);
      this.emitError(err);
      throw err;
    }
  }

  public onMessage(handler: (message: InboundMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public onStateChange(handler: (state: TransportState) => void): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  public onError(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message: InboundMessage = JSON.parse(data);
      this.log('Received message:', message);
      
      this.messageHandlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          this.log('Handler error:', error);
        }
      });
    } catch (error) {
      this.log('Failed to parse message:', error);
      this.emitError(new Error('Invalid message format'));
    }
  }

  /**
   * Handle WebSocket disconnect
   */
  private handleDisconnect(): void {
    this.log('Disconnected');
    this.ws = null;

    if (this.autoReconnect && 
        (this.maxReconnectAttempts === 0 || this.reconnectAttempts < this.maxReconnectAttempts)) {
      this.setState('reconnecting');
      this.scheduleReconnect();
    } else {
      this.setState('disconnected');
    }
  }

  /**
   * Schedule reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch((error) => {
        this.log('Reconnect failed:', error);
        this.handleDisconnect();
      });
    }, delay);
  }

  /**
   * Flush queued messages
   */
  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) {
      return;
    }

    this.log(`Flushing ${this.messageQueue.length} queued messages`);
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    queue.forEach((message) => {
      this.send(message).catch((error) => {
        this.log('Failed to flush message:', error);
      });
    });
  }

  /**
   * Set connection state
   */
  private setState(state: TransportState): void {
    if (this._state === state) {
      return;
    }

    this._state = state;
    this.stateHandlers.forEach((handler) => {
      try {
        handler(state);
      } catch (error) {
        this.log('State handler error:', error);
      }
    });
  }

  /**
   * Emit error to handlers
   */
  private emitError(error: Error): void {
    this.errorHandlers.forEach((handler) => {
      try {
        handler(error);
      } catch (err) {
        this.log('Error handler error:', err);
      }
    });
  }

  /**
   * Debug logging
   */
  private log(message: string, data?: unknown): void {
    if (this.debug && typeof console !== 'undefined') {
      console.log(`[WebSocketTransport] ${message}`, data || '');
    }
  }
}
