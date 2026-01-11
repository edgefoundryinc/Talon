import type {
  TalonTransport,
  OutboundMessage,
  InboundMessage,
  TransportState,
} from '../types';

/**
 * Webhook transport options
 */
export interface WebhookTransportOptions {
  /** Webhook URL */
  url: string;
  
  /** HTTP method */
  method?: 'POST' | 'PUT';
  
  /** Custom headers */
  headers?: Record<string, string>;
  
  /** Request timeout in ms */
  timeout?: number;
  
  /** Retry failed requests */
  retry?: boolean;
  
  /** Max retry attempts */
  maxRetries?: number;
  
  /** Retry delay in ms */
  retryDelay?: number;
  
  /** Debug mode */
  debug?: boolean;
}

/**
 * Webhook transport for fire-and-forget HTTP requests
 * 
 * Features:
 * - One-way communication (no responses)
 * - HTTP POST/PUT requests
 * - Optional retry logic
 * - Custom headers support
 * 
 * Use this for:
 * - Server-side event delivery
 * - Fire-and-forget scenarios
 * - When WebSocket not available/needed
 * 
 * @example
 * ```typescript
 * const transport = new WebhookTransport({
 *   url: 'https://edge.sygnl.io/webhook',
 *   method: 'POST',
 *   retry: true
 * });
 * ```
 */
export class WebhookTransport implements TalonTransport {
  private url: string;
  private method: 'POST' | 'PUT';
  private headers: Record<string, string>;
  private timeout: number;
  private retry: boolean;
  private maxRetries: number;
  private retryDelay: number;
  private debug: boolean;
  private _state: TransportState = 'disconnected';
  
  private messageHandlers = new Set<(message: InboundMessage) => void>();
  private stateHandlers = new Set<(state: TransportState) => void>();
  private errorHandlers = new Set<(error: Error) => void>();

  constructor(options: WebhookTransportOptions) {
    this.url = options.url;
    this.method = options.method ?? 'POST';
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    this.timeout = options.timeout ?? 10000;
    this.retry = options.retry ?? false;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.debug = options.debug ?? false;
  }

  public get state(): TransportState {
    return this._state;
  }

  public async connect(): Promise<void> {
    // Webhook is "connected" immediately (stateless)
    this.log('Webhook transport ready');
    this.setState('connected');
  }

  public disconnect(): void {
    this.log('Disconnecting webhook transport');
    this.setState('disconnected');
  }

  public async send(message: OutboundMessage): Promise<void> {
    if (this._state !== 'connected') {
      throw new Error('Transport not connected');
    }

    let lastError: Error | null = null;
    const attempts = this.retry ? this.maxRetries + 1 : 1;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        await this.sendRequest(message);
        this.log(`Sent message (attempt ${attempt + 1})`);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Send failed');
        this.log(`Send failed (attempt ${attempt + 1}):`, lastError);

        if (attempt < attempts - 1) {
          // Wait before retry (exponential backoff)
          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All attempts failed
    if (lastError) {
      this.emitError(lastError);
      throw lastError;
    }
  }

  public onMessage(handler: (message: InboundMessage) => void): () => void {
    // Webhook is one-way, but keep interface consistent
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
   * Send HTTP request
   */
  private async sendRequest(message: OutboundMessage): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.url, {
        method: this.method,
        headers: this.headers,
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.log(`Request successful: ${response.status}`);
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
      
      throw new Error('Request failed');
    }
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
      console.log(`[WebhookTransport] ${message}`, data || '');
    }
  }
}
