import type {
  ActionMessage,
  AimMessage,
  ChatMessage,
  LobbyStateMessage,
  MoveIntentKey,
} from "@shared/net/protocol.ts";
import { parseServerToClientMessage } from "@shared/net/protocol.ts";
import { COMPAT_HASH } from "@shared/config/compat.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

type ConnectOptions = {
  compatHash?: string;
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
  private lobbyStateHandlers: Array<(state: LobbyStateMessage) => void> = [];
  private openHandlers: Array<() => void> = [];
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<(message: string) => void> = [];
  private readonly validateSnapshotMessages =
    (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false;

  public connect(
    url: string,
    {
      googleIdToken,
      playerName,
      compatHash = COMPAT_HASH,
    }: ConnectOptions = {},
  ): void {
    this.disconnect();

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          t: "hello",
          compatHash,
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

      if (serverMessage.t === "lobby_state") {
        for (const lobbyStateHandler of this.lobbyStateHandlers) {
          lobbyStateHandler(serverMessage);
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

  public sendMoveIntent(
    seq: number,
    key: MoveIntentKey,
    pressed: boolean,
  ): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({ t: "move", seq, key, pressed }));
  }

  public sendAim(seq: number, theta: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const message: AimMessage = { t: "aim", seq, theta };
    this.socket.send(JSON.stringify(message));
  }

  public sendAction(actionMessage: ActionMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(actionMessage));
  }

  public sendRespawn(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({ t: "respawn" }));
  }

  public sendChat(text: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({ t: "chat", text }));
  }

  public joinLobby(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({ t: "lobby", action: "join" }));
  }

  public joinLobbyByCode(lobbyCode: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(
      JSON.stringify({ t: "lobby", action: "joinByCode", lobbyCode }),
    );
  }

  public leaveLobby(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({ t: "lobby", action: "leave" }));
  }

  public onSnapshot(snapshotHandler: (snapshot: WorldSnapshot) => void): void {
    this.snapshotHandlers.push(snapshotHandler);
  }

  public onWelcome(welcomeHandler: (entityId: number) => void): void {
    this.welcomeHandlers.push(welcomeHandler);
  }

  public onChat(chatHandler: (message: ChatMessage) => void): void {
    this.chatHandlers.push(chatHandler);
  }

  public onLobbyState(lobbyStateHandler: (state: LobbyStateMessage) => void): void {
    this.lobbyStateHandlers.push(lobbyStateHandler);
  }

  public onOpen(openHandler: () => void): void {
    this.openHandlers.push(openHandler);
  }

  public onClose(closeHandler: () => void): void {
    this.closeHandlers.push(closeHandler);
  }

  public onError(errorHandler: (message: string) => void): void {
    this.errorHandlers.push(errorHandler);
  }

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
