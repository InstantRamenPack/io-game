import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";

export class FakeNetworkServer implements NetworkServerLike {
  public readonly sent: Array<{ clientId: string; data: string | Uint8Array }> =
    [];

  public onOpen(): void {}
  public onMessage(): void {}
  public onClose(): void {}
  public send(clientId: string, data: string | Uint8Array): void {
    this.sent.push({ clientId, data });
  }
  public broadcast(data: string | Uint8Array): void {
    this.sent.push({ clientId: "*", data });
  }
  public disconnect(): void {}
}

type EventHandler = (event?: { data?: string }) => void;

type ListenerMap = Record<string, EventHandler[]>;

export class FakeWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;
  public static readonly instances: FakeWebSocket[] = [];

  public readonly url: string;
  public readyState = FakeWebSocket.CONNECTING;
  public readonly sent: string[] = [];
  private readonly listeners: ListenerMap = {};

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  public addEventListener(type: string, handler: EventHandler): void {
    const handlers = this.listeners[type] ?? [];
    handlers.push(handler);
    this.listeners[type] = handlers;
  }

  public removeEventListener(type: string, handler: EventHandler): void {
    const handlers = this.listeners[type];
    if (!handlers) {
      return;
    }
    const index = handlers.indexOf(handler);
    if (index >= 0) {
      handlers.splice(index, 1);
    }
  }

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }

  public emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  public emitError(): void {
    this.emit("error");
  }

  public emitMessage(data: string): void {
    this.emit("message", { data });
  }

  private emit(type: string, event: { data?: string } = {}): void {
    const handlers = this.listeners[type] ?? [];
    for (const handler of handlers) {
      handler(event);
    }
  }
}
