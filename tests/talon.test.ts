import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TalonClient } from '../src/TalonClient';
import { WebhookTransport } from '../src/transports/WebhookTransport';
import type { TalonTransport, OutboundMessage, InboundMessage, TransportState } from '../src/types';

// Mock transport for testing
class MockTransport implements TalonTransport {
  public _state: TransportState = 'disconnected';
  public sentMessages: OutboundMessage[] = [];
  
  private messageHandlers = new Set<(message: InboundMessage) => void>();
  private stateHandlers = new Set<(state: TransportState) => void>();
  private errorHandlers = new Set<(error: Error) => void>();

  get state(): TransportState {
    return this._state;
  }

  async connect(): Promise<void> {
    this._state = 'connected';
    this.stateHandlers.forEach((h) => h('connected'));
  }

  disconnect(): void {
    this._state = 'disconnected';
    this.stateHandlers.forEach((h) => h('disconnected'));
  }

  async send(message: OutboundMessage): Promise<void> {
    this.sentMessages.push(message);
  }

  onMessage(handler: (message: InboundMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStateChange(handler: (state: TransportState) => void): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  // Test helpers
  simulateMessage(message: InboundMessage): void {
    this.messageHandlers.forEach((h) => h(message));
  }

  simulateError(error: Error): void {
    this.errorHandlers.forEach((h) => h(error));
  }
}

describe('TalonClient', () => {
  let transport: MockTransport;
  let client: TalonClient;

  beforeEach(() => {
    transport = new MockTransport();
    client = new TalonClient({
      transport,
      autoConnect: false,
    });
  });

  describe('initialization', () => {
    it('should create client with transport', () => {
      expect(client).toBeDefined();
      expect(client.state).toBe('disconnected');
    });

    it('should auto-connect when autoConnect is true', async () => {
      const autoTransport = new MockTransport();
      const autoClient = new TalonClient({
        transport: autoTransport,
        autoConnect: true,
      });

      // Give it a tick to connect
      await new Promise((resolve) => setTimeout(resolve, 10));
      
      expect(autoTransport.state).toBe('connected');
    });
  });

  describe('connection', () => {
    it('should connect transport', async () => {
      await client.connect();
      expect(transport.state).toBe('connected');
      expect(client.connected).toBe(true);
    });

    it('should disconnect transport', async () => {
      await client.connect();
      client.disconnect();
      expect(transport.state).toBe('disconnected');
      expect(client.connected).toBe(false);
    });
  });

  describe('sending messages', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should send event to transport', async () => {
      await client.send({ event: 'test', data: 'value' });
      
      expect(transport.sentMessages).toHaveLength(1);
      expect(transport.sentMessages[0].type).toBe('event');
      expect(transport.sentMessages[0].data.event).toBe('test');
    });

    it('should add timestamp and id to messages', async () => {
      await client.send({ event: 'test' });
      
      const message = transport.sentMessages[0];
      expect(message.timestamp).toBeDefined();
      expect(message.id).toBeDefined();
      expect(message.id).toMatch(/^msg_/);
    });
  });

  describe('receiving messages', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should receive messages from transport', () => {
      const handler = vi.fn();
      client.on('test_event', handler);

      transport.simulateMessage({
        type: 'test_event',
        data: { foo: 'bar' },
      });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({ foo: 'bar' });
    });

    it('should support multiple handlers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      client.on('test_event', handler1);
      client.on('test_event', handler2);

      transport.simulateMessage({
        type: 'test_event',
        data: { test: true },
      });

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('should unsubscribe handlers', () => {
      const handler = vi.fn();
      const unsubscribe = client.on('test_event', handler);

      unsubscribe();

      transport.simulateMessage({
        type: 'test_event',
        data: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle once subscription', () => {
      const handler = vi.fn();
      client.once('test_event', handler);

      // First message
      transport.simulateMessage({
        type: 'test_event',
        data: { count: 1 },
      });

      // Second message
      transport.simulateMessage({
        type: 'test_event',
        data: { count: 2 },
      });

      // Handler should only be called once
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({ count: 1 });
    });

    it('should remove all handlers with off', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      client.on('test_event', handler1);
      client.on('test_event', handler2);
      client.off('test_event');

      transport.simulateMessage({
        type: 'test_event',
        data: {},
      });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should not throw if handler throws', () => {
      client.on('test_event', () => {
        throw new Error('Handler error');
      });

      expect(() => {
        transport.simulateMessage({
          type: 'test_event',
          data: {},
        });
      }).not.toThrow();
    });
  });
});

describe('WebhookTransport', () => {
  beforeEach(() => {
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
  });

  it('should create webhook transport', () => {
    const transport = new WebhookTransport({
      url: 'https://example.com/webhook',
    });

    expect(transport.state).toBe('disconnected');
  });

  it('should connect immediately', async () => {
    const transport = new WebhookTransport({
      url: 'https://example.com/webhook',
    });

    await transport.connect();
    expect(transport.state).toBe('connected');
  });

  it('should send HTTP POST request', async () => {
    const transport = new WebhookTransport({
      url: 'https://example.com/webhook',
      method: 'POST',
    });

    await transport.connect();
    await transport.send({
      type: 'event',
      data: { test: true },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('should retry on failure when retry enabled', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({ ok: false, status: 500, statusText: 'Error' });
      }
      return Promise.resolve({ ok: true, status: 200, statusText: 'OK' });
    });

    const transport = new WebhookTransport({
      url: 'https://example.com/webhook',
      retry: true,
      maxRetries: 3,
      retryDelay: 10, // Fast for testing
    });

    await transport.connect();
    await transport.send({
      type: 'event',
      data: { test: true },
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
