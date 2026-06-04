import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import type {
  ExtractionSnapshot,
  InfrastructureSnapshot,
} from "@shared/net/snapshots.ts";
import type {
  LobbyStateMessage,
  GameCompleteMessage,
  GameOverMessage,
} from "@shared/net/protocol.ts";
import { normalizePlayerName } from "@shared/playerName.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";

export type SessionLifecycleResetHooks = {
  resetPointerAim: () => void;
  resetHeldAttack: () => void;
  resetInput: () => void;
  resetFrameController: () => void;
  stopFrameLoop: () => void;
  clearMovementSuppressions: () => void;
  invalidateRendererView: () => void;
  resetPresentation: () => void;
  resetPlacementPreview: () => void;
  resetRendererWorldState: () => void;
  disconnectTransport?: () => void;
};

export class ClientSessionLifecycle {
  private started = false;
  private sessionReady = false;
  private pendingPlayerName: string | null = null;
  private currentWorldId: string | undefined = undefined;
  private playerEntityId: number | undefined = undefined;
  private spectateEntityId: number | null = null;
  private lobbyState: LobbyStateMessage | undefined = undefined;
  private latestExtractionState: ExtractionSnapshot | null = null;
  private latestInfrastructureState: InfrastructureSnapshot = {
    energyActive: true,
    commsActive: true,
  };
  private latestMinimapPlayers: ReadonlyArray<{
    id: number;
    x: number;
    y: number;
    alive: boolean;
  }> = [];
  private worldState: ClientWorldState | undefined = undefined;

  public begin(): boolean {
    if (this.started) {
      return false;
    }

    this.started = true;
    this.sessionReady = false;
    return true;
  }

  public markSessionReady(): void {
    this.sessionReady = true;
  }

  public reset(): void {
    this.started = false;
    this.sessionReady = false;
  }

  public isStarted(): boolean {
    return this.started;
  }

  public isSessionReady(): boolean {
    return this.sessionReady;
  }

  public createWorldState(snapshotHistoryLimit: number): ClientWorldState {
    return new ClientWorldState(snapshotHistoryLimit);
  }

  public getWorldState(): ClientWorldState | undefined {
    return this.worldState;
  }

  public setWorldState(worldState: ClientWorldState | undefined): void {
    this.worldState = worldState;
  }

  public getPlayerEntityId(): number | undefined {
    return this.playerEntityId;
  }

  public setPlayerEntityId(playerEntityId: number | undefined): void {
    this.playerEntityId = playerEntityId;
  }

  public getPendingPlayerName(): string | null {
    return this.pendingPlayerName;
  }

  public setPendingPlayerName(pendingPlayerName: string | null): void {
    this.pendingPlayerName = pendingPlayerName;
  }

  public getCurrentWorldId(): string | undefined {
    return this.currentWorldId;
  }

  public setCurrentWorldId(currentWorldId: string | undefined): void {
    this.currentWorldId = currentWorldId;
  }

  public getSpectateEntityId(): number | null {
    return this.spectateEntityId;
  }

  public setSpectateEntityId(spectateEntityId: number | null): void {
    this.spectateEntityId = spectateEntityId;
  }

  public getLobbyState(): LobbyStateMessage | undefined {
    return this.lobbyState;
  }

  public setLobbyState(lobbyState: LobbyStateMessage | undefined): void {
    this.lobbyState = lobbyState;
  }

  public getLatestExtractionState(): ExtractionSnapshot | null {
    return this.latestExtractionState;
  }

  public setLatestExtractionState(
    latestExtractionState: ExtractionSnapshot | null,
  ): void {
    this.latestExtractionState = latestExtractionState;
  }

  public getLatestInfrastructureState(): InfrastructureSnapshot {
    return this.latestInfrastructureState;
  }

  public setLatestInfrastructureState(
    latestInfrastructureState: InfrastructureSnapshot,
  ): void {
    this.latestInfrastructureState = latestInfrastructureState;
  }

  public getLatestMinimapPlayers(): ReadonlyArray<{
    id: number;
    x: number;
    y: number;
    alive: boolean;
  }> {
    return this.latestMinimapPlayers;
  }

  public setLatestMinimapPlayers(
    latestMinimapPlayers: ReadonlyArray<{
      id: number;
      x: number;
      y: number;
      alive: boolean;
    }>,
  ): void {
    this.latestMinimapPlayers = latestMinimapPlayers;
  }

  public isInActiveMatch(): boolean {
    return (
      this.lobbyState?.inLobby === true && this.lobbyState?.startedAtMs != null
    );
  }

  public getSpectateTargetName(): string | null {
    if (this.spectateEntityId === null) {
      return null;
    }
    const entity = this.worldState?.clientWorld?.entities.get(
      this.spectateEntityId,
    );
    return entity?.kind === "player" ? (entity.name ?? null) : null;
  }

  public resolveWelcomeFromSnapshot(
    getWorldEntities: () => Iterable<ClientEntity> | undefined,
    onWelcome: (entityId: number) => void,
  ): void {
    if (this.sessionReady) {
      return;
    }
    const pendingName = this.pendingPlayerName;
    if (!pendingName) {
      return;
    }
    const entities = getWorldEntities();
    if (!entities) {
      return;
    }
    const normalizedName = normalizePlayerName(pendingName, "");
    const matches = [...entities].filter((entity) => {
      if (entity.kind !== "player") {
        return false;
      }
      if (normalizedName) {
        return entity.name === normalizedName;
      }
      return entity.name === `player-${entity.id}`;
    });
    if (matches.length !== 1) {
      return;
    }
    const [matchedPlayer] = matches;
    if (!matchedPlayer) {
      return;
    }
    onWelcome(matchedPlayer.id);
  }

  public resetForInstanceMigration(
    snapshotHistoryLimit: number,
    hooks: SessionLifecycleResetHooks,
  ): void {
    this.worldState?.clear();
    this.worldState = this.createWorldState(snapshotHistoryLimit);
    this.latestMinimapPlayers = [];
    this.latestInfrastructureState = { energyActive: true, commsActive: true };
    this.latestExtractionState = null;
    hooks.resetFrameController();
    hooks.resetPointerAim();
    hooks.resetHeldAttack();
    hooks.resetInput();
    hooks.invalidateRendererView();
    hooks.resetPresentation();
    hooks.clearMovementSuppressions();
    hooks.resetPlacementPreview();
    hooks.resetRendererWorldState();
  }

  public resetSessionState(
    disconnectTransport: boolean,
    hooks: SessionLifecycleResetHooks,
  ): void {
    this.reset();
    hooks.resetPointerAim();
    hooks.resetHeldAttack();
    hooks.resetFrameController();
    hooks.stopFrameLoop();
    hooks.resetInput();
    hooks.invalidateRendererView();
    hooks.clearMovementSuppressions();
    this.lobbyState = undefined;
    if (disconnectTransport && hooks.disconnectTransport) {
      hooks.disconnectTransport();
    }
    this.worldState?.clear();
    this.worldState = undefined;
    this.playerEntityId = undefined;
    this.pendingPlayerName = null;
    this.spectateEntityId = null;
    this.latestMinimapPlayers = [];
    this.latestInfrastructureState = { energyActive: true, commsActive: true };
    this.latestExtractionState = null;
    hooks.resetPresentation();
    hooks.resetPlacementPreview();
    hooks.resetRendererWorldState();
  }

  public notifyLobbyState(
    state: LobbyStateMessage,
    onLobbyState: (state: LobbyStateMessage) => void,
  ): void {
    this.lobbyState = state;
    onLobbyState(state);
  }

  public notifyGameComplete(
    msg: GameCompleteMessage,
    handlers: Array<(msg: GameCompleteMessage) => void>,
  ): void {
    for (const handler of handlers) {
      handler(msg);
    }
  }

  public notifyGameOver(
    msg: GameOverMessage,
    handlers: Array<(msg: GameOverMessage) => void>,
  ): void {
    for (const handler of handlers) {
      handler(msg);
    }
  }
}
