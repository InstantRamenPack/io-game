import type {
  ActionMessage,
  ChatMessage,
  GameCompleteMessage,
  InputIntentMessage,
  LobbyStateMessage,
} from "@shared/net/protocol.ts";
import { parseServerToClientMessage } from "@shared/net/protocol.ts";
import { COMPAT_HASH } from "@shared/config/compat.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import {
  DebugNetworkSimulator,
  type DebugNetworkMetrics,
  type DebugNetworkProfileName,
} from "@client/net/DebugNetworkSimulator.ts";

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
  private gameCompleteHandlers: Array<(message: GameCompleteMessage) => void> =
    [];
  private openHandlers: Array<() => void> = [];
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<(message: string) => void> = [];
  private readonly outboundNetworkSimulator = new DebugNetworkSimulator();
  private readonly inboundNetworkSimulator = new DebugNetworkSimulator();
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
      this.sendRaw(
        JSON.stringify({
          t: "hello",
          compatHash,
          googleIdToken,
          playerName,
        }),
        { bypassSimulation: true },
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
      this.inboundNetworkSimulator.deliver(String(messageEvent.data), (raw) =>
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
      JSON.stringify({
        t: "input",
        seq,
        ...(clientTimeMs === undefined ? {} : { clientTimeMs }),
        theta,
        movement,
      }),
    );
  }

  public sendAction(actionMessage: ActionMessage): void {
    this.sendRaw(JSON.stringify(actionMessage));
  }

  public sendRespawn(): void {
    this.sendRaw(JSON.stringify({ t: "respawn" }));
  }

  public sendChat(text: string): void {
    this.sendRaw(JSON.stringify({ t: "chat", text }));
  }

  public joinLobby(): void {
    this.sendRaw(JSON.stringify({ t: "lobby", action: "join" }));
  }

  public joinLobbyByCode(lobbyCode: string): void {
    this.sendRaw(
      JSON.stringify({ t: "lobby", action: "joinByCode", lobbyCode }),
    );
  }

  public leaveLobby(): void {
    this.sendRaw(JSON.stringify({ t: "lobby", action: "leave" }));
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

  public onWelcome(welcomeHandler: (entityId: number) => void): void {
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
    payload: string,
    options: { bypassSimulation?: boolean } = {},
  ): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (options.bypassSimulation) {
      socket.send(payload);
      return;
    }
    this.outboundNetworkSimulator.deliver(payload, (delayedPayload) => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      socket.send(delayedPayload);
    });
  }

  private handleRawServerMessage(rawMessage: string): void {
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

    if (serverMessage.t === "game_complete") {
      for (const handler of this.gameCompleteHandlers) {
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
