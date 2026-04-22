import type {
  CloseHandler,
  MessageHandler,
  NetworkServerLike,
  OpenHandler,
} from "@server/net/NetworkServerLike.ts";

/**
 * Network adapter that scopes send/broadcast operations to a fixed client set.
 * Useful for virtual game instances that share one physical websocket server.
 */
export class ScopedWsServer implements NetworkServerLike {
  private readonly parent: NetworkServerLike;
  private readonly scopedClientIds = new Set<string>();
  private readonly openHandlers: OpenHandler[] = [];
  private readonly messageHandlers: MessageHandler[] = [];
  private readonly closeHandlers: CloseHandler[] = [];

  constructor(parent: NetworkServerLike) {
    this.parent = parent;
  }

  public addClient(clientId: string): void {
    this.scopedClientIds.add(clientId);
    for (const handler of this.openHandlers) {
      handler(clientId);
    }
  }

  public removeClient(clientId: string): void {
    if (!this.scopedClientIds.delete(clientId)) {
      return;
    }
    for (const handler of this.closeHandlers) {
      handler(clientId);
    }
  }

  public hasClient(clientId: string): boolean {
    return this.scopedClientIds.has(clientId);
  }

  public onOpen(handler: OpenHandler): void {
    this.openHandlers.push(handler);
  }

  public onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  public onClose(handler: CloseHandler): void {
    this.closeHandlers.push(handler);
  }

  public send(clientId: string, data: string | Uint8Array): void {
    if (!this.scopedClientIds.has(clientId)) {
      return;
    }
    this.parent.send(clientId, data);
  }

  public broadcast(data: string | Uint8Array): void {
    for (const clientId of this.scopedClientIds) {
      this.parent.send(clientId, data);
    }
  }

  public disconnect(clientId: string, reason?: string): void {
    if (!this.scopedClientIds.has(clientId)) {
      return;
    }
    this.parent.disconnect(clientId, reason);
    this.removeClient(clientId);
  }
}
