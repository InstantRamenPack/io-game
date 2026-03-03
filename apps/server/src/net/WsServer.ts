import type { ServerWebSocket } from "bun";

type WsData = { clientId: string };

/** Thin server-side WebSocket client registry and event router. */
export class WsServer {
  private readonly sockets = new Map<string, ServerWebSocket<WsData>>();
  private readonly messageHandlers: Array<
    (clientId: string, rawMessage: string) => void
  > = [];
  private readonly openHandlers: Array<(clientId: string) => void> = [];
  private readonly closeHandlers: Array<(clientId: string) => void> = [];

  /** Registers a handler for raw inbound client messages. */
  onMessage(handler: (clientId: string, rawMessage: string) => void): void {
    this.messageHandlers.push(handler);
  }

  /** Registers a handler for socket-open events. */
  onOpen(handler: (clientId: string) => void): void {
    this.openHandlers.push(handler);
  }

  /** Registers a handler for socket-close events. */
  onClose(handler: (clientId: string) => void): void {
    this.closeHandlers.push(handler);
  }

  /** Tracks an opened socket and notifies listeners. */
  handleOpen(webSocket: ServerWebSocket<WsData>): void {
    const clientId = webSocket.data.clientId;
    this.sockets.set(clientId, webSocket);
    for (const openHandler of this.openHandlers) {
      openHandler(clientId);
    }
  }

  /** Normalizes message payloads and dispatches to listeners. */
  handleMessage(
    webSocket: ServerWebSocket<WsData>,
    rawMessageData: string | Buffer,
  ): void {
    const clientId = webSocket.data.clientId;
    const rawMessage =
      typeof rawMessageData === "string"
        ? rawMessageData
        : rawMessageData.toString();
    for (const messageHandler of this.messageHandlers) {
      messageHandler(clientId, rawMessage);
    }
  }

  /** Removes a closed socket and notifies listeners. */
  handleClose(webSocket: ServerWebSocket<WsData>): void {
    const clientId = webSocket.data.clientId;
    this.sockets.delete(clientId);
    for (const closeHandler of this.closeHandlers) {
      closeHandler(clientId);
    }
  }

  /** Sends a message to one connected client. */
  send(clientId: string, data: string | Uint8Array): void {
    this.sockets.get(clientId)?.send(data);
  }

  /** Sends a message to all connected clients. */
  broadcast(data: string | Uint8Array): void {
    for (const clientSocket of this.sockets.values()) {
      clientSocket.send(data);
    }
  }

  /** Closes and removes a connected client socket. */
  disconnect(clientId: string, reason?: string): void {
    this.sockets.get(clientId)?.close(1000, reason);
    this.sockets.delete(clientId);
  }
}
