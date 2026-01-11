# @sygnl/talon

> Bidirectional event delivery client with WebSocket and Webhook transports.

## Install

```bash
npm install @sygnl/talon
```

## Quick Start

### WebSocket (Bidirectional)

```typescript
import { TalonClient, WebSocketTransport } from '@sygnl/talon';

const talon = new TalonClient({
  transport: new WebSocketTransport('wss://edge.example.com'),
  autoConnect: true
});

// Send events TO edge
await talon.send({ event: 'purchase', order_id: '123', total: 99.99 });

// Receive updates FROM edge
talon.on('attribution_updated', (data) => {
  console.log('Attribution:', data);
});

talon.on('context_synced', (data) => {
  console.log('Context synced:', data);
});
```

### Webhook (Fire-and-forget)

```typescript
import { TalonClient, WebhookTransport } from '@sygnl/talon';

const talon = new TalonClient({
  transport: new WebhookTransport('https://edge.example.com/webhook')
});

await talon.send({ event: 'page_view', url: '/products' });
```

## API

### `TalonClient`

```typescript
const talon = new TalonClient({
  transport: WebSocketTransport | WebhookTransport,
  autoConnect?: boolean,
  debug?: boolean
});

// Methods
await talon.connect();
await talon.disconnect();
await talon.send(event);
talon.on(eventName, handler);
talon.off(eventName, handler);
talon.isConnected(); // boolean
```

### Transports

**WebSocketTransport** - Bidirectional, auto-reconnect
```typescript
new WebSocketTransport(url, {
  reconnect?: boolean,
  reconnectInterval?: number,
  maxReconnectAttempts?: number
});
```

**WebhookTransport** - One-way HTTP POST
```typescript
new WebhookTransport(url, {
  method?: 'POST' | 'PUT',
  retries?: number
});
```

## Connection States

- `disconnected` - Not connected
- `connecting` - Connection in progress
- `connected` - Ready to send/receive
- `reconnecting` - Attempting to reconnect

## License

Apache-2.0
