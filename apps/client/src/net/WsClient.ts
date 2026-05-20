import type {
  ActionMessage,
  ChatMessage,
  GameCompleteMessage,
  GameOverMessage,
  InputIntentMessage,
  LobbyStateMessage,
  SpectateUpdateMessage,
} from "@shared/net/protocol.ts";
import {
  encodeClientToServerMessage,
  parseServerToClientMessage,
} from "@shared/net/protocol.ts";
import { COMPAT_HASH } from "@shared/config/compat.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import {
  DebugNetworkSimulator,
  type DebugNetworkMetrics,
  type DebugNetworkProfileName,
} from "@client/net/DebugNetworkSimulator.ts";

type ConnectOptions = {
  compatHash?: string;
  playerName?: string;
  preview?: boolean;
};

/**
 * Minimal browser WebSocket client for protocol messaging.
 * Wraps a browser socket with the shared message parsing helpers.
 */
export class WsClient {
  public socket?: WebSocket;

  private snapshotHandlers: Array<(snapshot: WorldSnapshot) => void> = [];
  private welcomeHandlers: Array<(entityId: number, worldId?: string) => void> =
    [];
  private chatHandlers: Array<(message: ChatMessage) => void> = [];
  private lobbyStateHandlers: Array<(state: LobbyStateMessage) => void> = [];
  private gameCompleteHandlers: Array<(message: GameCompleteMessage) => void> =
    [];
  private gameOverHandlers: Array<(message: GameOverMessage) => void> = [];
  private spectateUpdateHandlers: Array<
    (message: SpectateUpdateMessage) => void
  > = [];
  private openHandlers: Array<() => void> = [];
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<(message: string) => void> = [];
  private readonly outboundNetworkSimulator = new DebugNetworkSimulator();
  private readonly inboundNetworkSimulator = new DebugNetworkSimulator();
  private readonly validateSnapshotMessages =
    (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false;

  public connect(
    url: string,
    { playerName, preview, compatHash = COMPAT_HASH }: ConnectOptions = {},
  ): void {
    this.disconnect();

    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.sendRaw(
        encodeClientToServerMessage({
          t: "hello",
          compatHash,
          playerName,
          ...(preview === undefined ? {} : { preview }),
        }),
        { bypassSimulation: true },
      );
      for (const openHandler of this.openHandlers) {
        openHandler();
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = undefined;
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
      const payload =
        messageEvent.data instanceof ArrayBuffer
          ? new Uint8Array(messageEvent.data)
          : String(messageEvent.data);
      this.inboundNetworkSimulator.deliver(payload, (raw) =>
        this.handleRawServerMessage(raw),
      );
    });
  }

  public sendInputIntent(
    seq: number,
    clientTimeMs: number | undefined,
    theta: number,
    movement: InputIntentMessage["movement"],
  ): void {
    this.sendRaw(
      encodeClientToServerMessage({
        t: "input",
        seq,
        ...(clientTimeMs === undefined ? {} : { clientTimeMs }),
        theta,
        movement,
      }),
    );
  }

  public sendAction(actionMessage: ActionMessage): void {
    this.sendRaw(encodeClientToServerMessage(actionMessage));
  }

  public sendRespawn(): void {
    this.sendRaw(encodeClientToServerMessage({ t: "respawn" }));
  }

  public sendChat(text: string): void {
    this.sendRaw(encodeClientToServerMessage({ t: "chat", text }));
  }

  public joinLobby(): void {
    this.sendRaw(encodeClientToServerMessage({ t: "lobby", action: "join" }));
  }

  public joinLobbyByCode(lobbyCode: string): void {
    this.sendRaw(
      encodeClientToServerMessage({
        t: "lobby",
        action: "joinByCode",
        lobbyCode,
      }),
    );
  }

  public leaveLobby(): void {
    this.sendRaw(encodeClientToServerMessage({ t: "lobby", action: "leave" }));
  }

  public startLobby(): void {
    this.sendRaw(encodeClientToServerMessage({ t: "lobby", action: "start" }));
  }

  public setDebugNetworkProfile(
    profileName: DebugNetworkProfileName,
    seed = 1,
  ): void {
    this.outboundNetworkSimulator.configure({
      profileName,
      seed,
      enabled: true,
    });
    this.inboundNetworkSimulator.configure({
      profileName,
      seed: seed + 1,
      enabled: true,
    });
  }

  public disableDebugNetworkSimulation(): void {
    this.outboundNetworkSimulator.disable();
    this.inboundNetworkSimulator.disable();
  }

  public getDebugNetworkMetrics(): {
    outbound: DebugNetworkMetrics;
    inbound: DebugNetworkMetrics;
  } {
    return {
      outbound: this.outboundNetworkSimulator.getMetrics(),
      inbound: this.inboundNetworkSimulator.getMetrics(),
    };
  }

  public onSnapshot(snapshotHandler: (snapshot: WorldSnapshot) => void): void {
    this.snapshotHandlers.push(snapshotHandler);
  }

  public onWelcome(
    welcomeHandler: (entityId: number, worldId?: string) => void,
  ): void {
    this.welcomeHandlers.push(welcomeHandler);
  }

  public onChat(chatHandler: (message: ChatMessage) => void): void {
    this.chatHandlers.push(chatHandler);
  }

  public onLobbyState(
    lobbyStateHandler: (state: LobbyStateMessage) => void,
  ): void {
    this.lobbyStateHandlers.push(lobbyStateHandler);
  }

  public onGameComplete(handler: (message: GameCompleteMessage) => void): void {
    this.gameCompleteHandlers.push(handler);
  }

  public onGameOver(handler: (message: GameOverMessage) => void): void {
    this.gameOverHandlers.push(handler);
  }

  public onSpectateUpdate(
    handler: (message: SpectateUpdateMessage) => void,
  ): void {
    this.spectateUpdateHandlers.push(handler);
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

  private sendRaw(
    payload: Uint8Array,
    options: { bypassSimulation?: boolean } = {},
  ): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (options.bypassSimulation) {
      socket.send(new Uint8Array(payload));
      return;
    }
    this.outboundNetworkSimulator.deliver(payload, (delayedPayload) => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (typeof delayedPayload === "string") {
        socket.send(delayedPayload);
      } else {
        socket.send(new Uint8Array(delayedPayload));
      }
    });
  }

  private handleRawServerMessage(rawMessage: string | Uint8Array): void {
    const serverMessage = parseServerToClientMessage(rawMessage, {
      validateSnapshots: this.validateSnapshotMessages,
    });
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
        welcomeHandler(serverMessage.entityId, serverMessage.worldId);
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

    if (serverMessage.t === "game_complete") {
      for (const handler of this.gameCompleteHandlers) {
        handler(serverMessage);
      }
      return;
    }

    if (serverMessage.t === "game_over") {
      for (const handler of this.gameOverHandlers) {
        handler(serverMessage);
      }
      return;
    }

    if (serverMessage.t === "spectate_update") {
      for (const handler of this.spectateUpdateHandlers) {
        handler(serverMessage);
      }
      return;
    }

    if (serverMessage.t === "error") {
      for (const errorHandler of this.errorHandlers) {
        errorHandler(serverMessage.message);
      }
    }
  }
}
