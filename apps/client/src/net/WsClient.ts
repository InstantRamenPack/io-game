import {
  type InputCommand,
  type ChatMessage,
  parseServerToClientMessage,
} from "@shared/net/protocol.ts";
import { GameConfig } from "@shared/config/GameConfig.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

export type ConnectOptions = {
  protocolVersion?: number;
  googleIdToken?: string;
  playerName?: string;
};

/**
 * Minimal browser WebSocket client for protocol messaging.
 * Wraps a browser socket with the shared message parsing helpers.
 */
export class WsClient {
  public socket?: WebSocket;

  private snapshotHandlers: Array<(snapshot: WorldSnapshot) => void> = [];
  private welcomeHandlers: Array<(entityId: number) => void> = [];
  private chatHandlers: Array<(message: ChatMessage) => void> = [];
  private openHandlers: Array<() => void> = [];
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<(message: string) => void> = [];
  private readonly validateSnapshotMessages =
    (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false;

  /**
   * Opens a WebSocket connection and registers protocol message handlers.
   * @param url WebSocket endpoint to connect to.
   * @param options Optional hello-handshake fields sent once the socket opens.
   */
  public connect(
    url: string,
    {
      googleIdToken,
      playerName,
      protocolVersion = GameConfig.DEFAULT_PROTOCOL_VERSION,
    }: ConnectOptions = {},
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
          playerName,
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
      const serverMessage = parseServerToClientMessage(
        String(messageEvent.data),
        { validateSnapshots: this.validateSnapshotMessages },
      );
      if (!serverMessage) {
        return;
      }

      if (serverMessage.t === "snapshot") {
        for (const snapshotHandler of this.snapshotHandlers) {
          snapshotHandler(serverMessage.snapshot);
        }
        return;
      }

      if (serverMessage.t === "welcome") {
        for (const welcomeHandler of this.welcomeHandlers) {
          welcomeHandler(serverMessage.entityId);
        }
        return;
      }

      if (serverMessage.t === "chat") {
        for (const chatHandler of this.chatHandlers) {
          chatHandler(serverMessage);
        }
        return;
      }

      if (serverMessage.t === "error") {
        for (const errorHandler of this.errorHandlers) {
          errorHandler(serverMessage.message);
        }
      }
    });
  }

  /**
   * Sends a validated input command to the server.
   * @param inputCommand Serialized input payload for the current tick.
   */
  public sendInput(inputCommand: InputCommand): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({ t: "input", cmd: inputCommand }));
  }

  public sendChat(text: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({ t: "chat", text }));
  }

  /**
   * Registers a callback for incoming snapshot messages.
   * @param snapshotHandler Callback invoked for each snapshot payload.
   */
  public onSnapshot(snapshotHandler: (snapshot: WorldSnapshot) => void): void {
    this.snapshotHandlers.push(snapshotHandler);
  }

  /**
   * Registers a callback for welcome messages that carry the player entity id.
   * @param welcomeHandler Callback invoked with the assigned entity id.
   */
  public onWelcome(welcomeHandler: (entityId: number) => void): void {
    this.welcomeHandlers.push(welcomeHandler);
  }

  /** Registers a callback for incoming chat messages. */
  public onChat(chatHandler: (message: ChatMessage) => void): void {
    this.chatHandlers.push(chatHandler);
  }

  /**
   * Registers a callback for socket open events.
   * @param openHandler Callback invoked once the socket opens.
   */
  public onOpen(openHandler: () => void): void {
    this.openHandlers.push(openHandler);
  }

  /**
   * Registers a callback for socket close events.
   * @param closeHandler Callback invoked when the socket closes.
   */
  public onClose(closeHandler: () => void): void {
    this.closeHandlers.push(closeHandler);
  }

  /** Registers a callback for server error protocol messages. */
  public onError(errorHandler: (message: string) => void): void {
    this.errorHandlers.push(errorHandler);
  }

  /**
   * Closes the current socket connection, if any.
   * @param reason Optional close reason passed through to the socket.
   */
  public disconnect(reason?: string): void {
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
