/**
 * Message sent TO the edge
 */
export interface OutboundMessage {
  /** Message type/event name */
  type: string;
  
  /** Message payload */
  data: Record<string, unknown>;
  
  /** Optional message ID for tracking */
  id?: string;
  
  /** Timestamp */
  timestamp?: number;
}

/**
 * Message received FROM the edge
 */
export interface InboundMessage {
  /** Message type/event name */
  type: string;
  
  /** Message payload */
  data: Record<string, unknown>;
  
  /** Optional message ID */
  id?: string;
  
  /** Timestamp */
  timestamp?: number;
}

/**
 * Transport connection state
 */
export type TransportState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/**
 * Transport interface - all transports must implement this
 */
export interface TalonTransport {
  /**
   * Current connection state
   */
  readonly state: TransportState;
  
  /**
   * Connect to the transport
   */
  connect(): Promise<void>;
  
  /**
   * Disconnect from the transport
   */
  disconnect(): void;
  
  /**
   * Send a message to the edge
   * @param message - Message to send
   */
  send(message: OutboundMessage): Promise<void>;
  
  /**
   * Subscribe to messages from the edge
   * @param handler - Function to call when message received
   * @returns Unsubscribe function
   */
  onMessage(handler: (message: InboundMessage) => void): () => void;
  
  /**
   * Subscribe to connection state changes
   * @param handler - Function to call when state changes
   * @returns Unsubscribe function
   */
  onStateChange(handler: (state: TransportState) => void): () => void;
  
  /**
   * Subscribe to errors
   * @param handler - Function to call when error occurs
   * @returns Unsubscribe function
   */
  onError(handler: (error: Error) => void): () => void;
}

/**
 * Talon client options
 */
export interface TalonClientOptions {
  /** Transport implementation */
  transport: TalonTransport;
  
  /** Auto-connect on initialization */
  autoConnect?: boolean;
  
  /** Debug mode */
  debug?: boolean;
}

/**
 * Event handler function
 */
export type EventHandler<T = any> = (data: T) => void;
