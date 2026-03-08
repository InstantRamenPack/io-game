import {
  PROTOCOL_VERSION,
  type InputCommand,
  parseServerToClientMessage,
} from "@shared/net/protocol.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

/**
 * Minimal browser WebSocket client for protocol messaging.
 * Wraps a browser socket with the shared message parsing helpers.
 */
export class WsClient {
  socket?: WebSocket;

  private snapshotHandlers: Array<(snapshot: WorldSnapshot) => void> = [];
  private openHandlers: Array<() => void> = [];
  private closeHandlers: Array<() => void> = [];

  /**
   * Opens a WebSocket connection and registers protocol message handlers.
   * @param url WebSocket endpoint to connect to.
   */
  connect(url: string): void {
    this.disconnect();

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({ t: "hello", protocolVersion: PROTOCOL_VERSION }),
      );
      for (const openHandler of this.openHandlers) {
        openHandler();
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = undefined;
      }
      for (const closeHandler of this.closeHandlers) {
        closeHandler();
      }
    });

    socket.addEventListener("message", (messageEvent) => {
      const serverMessage = parseServerToClientMessage(
        String(messageEvent.data),
      );
      if (!serverMessage) {
        return;
      }

      if (serverMessage.t === "snapshot") {
        for (const snapshotHandler of this.snapshotHandlers) {
          snapshotHandler(serverMessage.snapshot);
        }
      }
    });
  }

  /**
   * Sends a validated input command to the server.
   * @param inputCommand Serialized input payload for the current tick.
   */
  sendInput(inputCommand: InputCommand): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({ t: "input", cmd: inputCommand }));
  }

  /**
   * Registers a callback for incoming snapshot messages.
   * @param snapshotHandler Callback invoked for each snapshot payload.
   */
  onSnapshot(snapshotHandler: (snapshot: WorldSnapshot) => void): void {
    this.snapshotHandlers.push(snapshotHandler);
  }

  /**
   * Registers a callback for socket open events.
   * @param openHandler Callback invoked once the socket opens.
   */
  onOpen(openHandler: () => void): void {
    this.openHandlers.push(openHandler);
  }

  /**
   * Registers a callback for socket close events.
   * @param closeHandler Callback invoked when the socket closes.
   */
  onClose(closeHandler: () => void): void {
    this.closeHandlers.push(closeHandler);
  }

  /**
   * Closes the current socket connection, if any.
   * @param reason Optional close reason passed through to the socket.
   */
  disconnect(reason?: string): void {
    if (!this.socket) {
      return;
    }
    const socket = this.socket;
    this.socket = undefined;
    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      socket.close(1000, reason);
    }
  }
}
