import type { ServerWebSocket } from "bun";

type WsData = { clientId: string };

/**
 * Thin server-side WebSocket registry and event router.
 * Wraps Bun sockets with client ids and a small subscription surface.
 */
export class WsServer {
  private readonly sockets = new Map<string, ServerWebSocket<WsData>>();
  private readonly messageHandlers: Array<
    (clientId: string, rawMessage: string) => void
  > = [];
  private readonly openHandlers: Array<(clientId: string) => void> = [];
  private readonly closeHandlers: Array<(clientId: string) => void> = [];

  /**
   * Registers a handler for socket-open events.
   * @param handler Callback invoked when a client connection opens.
   */
  onOpen(handler: (clientId: string) => void): void {
    this.openHandlers.push(handler);
  }

  /**
   * Registers a handler for raw inbound client messages.
   * @param handler Callback invoked with client id and raw message text.
   */
  onMessage(handler: (clientId: string, rawMessage: string) => void): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Registers a handler for socket-close events.
   * @param handler Callback invoked when a client connection closes.
   */
  onClose(handler: (clientId: string) => void): void {
    this.closeHandlers.push(handler);
  }

  /**
   * Tracks an opened socket and notifies listeners.
   * @param webSocket Open Bun WebSocket carrying the assigned client id.
   */
  handleOpen(webSocket: ServerWebSocket<WsData>): void {
    const clientId = webSocket.data.clientId;
    this.sockets.set(clientId, webSocket);
    for (const openHandler of this.openHandlers) {
      openHandler(clientId);
    }
  }

  /**
   * Normalizes message payloads and dispatches them to listeners.
   * @param webSocket Source socket.
   * @param rawMessageData Raw payload from Bun.
   */
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

  /**
   * Removes a closed socket and notifies listeners.
   * @param webSocket Closing socket.
   */
  handleClose(webSocket: ServerWebSocket<WsData>): void {
    const clientId = webSocket.data.clientId;
    this.sockets.delete(clientId);
    for (const closeHandler of this.closeHandlers) {
      closeHandler(clientId);
    }
  }

  /**
   * Sends a message to one connected client.
   * @param clientId Connected client id.
   * @param data Serialized payload to send.
   */
  send(clientId: string, data: string | Uint8Array): void {
    this.sockets.get(clientId)?.send(data);
  }

  /**
   * Sends a message to all connected clients.
   * @param data Serialized payload to broadcast.
   */
  broadcast(data: string | Uint8Array): void {
    for (const clientSocket of this.sockets.values()) {
      clientSocket.send(data);
    }
  }

  getConnectionCount(): number {
    return this.sockets.size;
  }

  /**
   * Closes and removes a connected client socket.
   * @param clientId Connected client id.
   * @param reason Optional close reason.
   */
  disconnect(clientId: string, reason?: string): void {
    this.sockets.get(clientId)?.close(1000, reason);
    this.sockets.delete(clientId);
  }
}
