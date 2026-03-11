import {
  type InputCommand,
} from "@shared/net/protocol.ts";
import { GameConfig } from "@shared/config/GameConfig.ts";
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
  private errorHandlers: Array<(message: string) => void> = [];

  /**
   * Opens a WebSocket connection and registers protocol message handlers.
   * @param url WebSocket endpoint to connect to.
   * @param googleIdToken Optional Google ID token sent during the hello handshake.
   * @param protocolVersion Protocol version to send in the hello handshake.
   */
  connect(
    url: string,
    googleIdToken?: string,
    protocolVersion = GameConfig.DEFAULT_PROTOCOL_VERSION,
  ): void {
    this.disconnect();

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          t: "hello",
          protocolVersion,
          googleIdToken,
        }),
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

    socket.addEventListener("error", () => {
      for (const errorHandler of this.errorHandlers) {
        errorHandler("socket_error");
      }
    });

    socket.addEventListener("message", (messageEvent) => {
      let serverMessage: unknown;
      try {
        serverMessage = JSON.parse(String(messageEvent.data)) as unknown;
      } catch {
        return;
      }

      if (
        typeof serverMessage === "object" &&
        serverMessage !== null &&
        "t" in serverMessage &&
        (serverMessage as { t?: unknown }).t === "snapshot"
      ) {
        const snapshot = (serverMessage as { snapshot?: unknown }).snapshot;
        if (
          typeof snapshot !== "object" ||
          snapshot === null ||
          !("tick" in snapshot) ||
          !("entities" in snapshot)
        ) {
          return;
        }
        for (const snapshotHandler of this.snapshotHandlers) {
          snapshotHandler(snapshot as WorldSnapshot);
        }
        return;
      }

      if (
        typeof serverMessage === "object" &&
        serverMessage !== null &&
        "t" in serverMessage &&
        (serverMessage as { t?: unknown }).t === "error"
      ) {
        const message = (serverMessage as { message?: unknown }).message;
        for (const errorHandler of this.errorHandlers) {
          errorHandler(
            typeof message === "string" ? message : "unknown_error",
          );
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

  /** Registers a callback for server error protocol messages. */
  onError(errorHandler: (message: string) => void): void {
    this.errorHandlers.push(errorHandler);
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
