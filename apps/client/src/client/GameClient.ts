import { ClientFrameLoop } from "@client/client/ClientFrameLoop.ts";
import { ClientRateMonitor } from "@client/client/ClientRateMonitor.ts";
import type {
  PerformanceRateState,
  PointerInput,
} from "@client/client/clientTypes.ts";
import {
  HeldAttackController,
  type LocalWeaponState,
} from "@client/client/HeldAttackController.ts";
import { PlacementPreviewController } from "@client/client/building/PlacementPreviewController.ts";
import { PointerAimController } from "@client/client/input/PointerAimController.ts";
import { ClientActionDispatcher } from "@client/client/network/ClientActionDispatcher.ts";
import { ClientSessionLifecycle } from "@client/client/session/ClientSessionLifecycle.ts";
import type { MovementSuppressionReason } from "@client/input/MovementSuppressionReason.ts";
import { InputBlocker } from "@client/input/InputBlocker.ts";
import { InputManager } from "@client/input/InputManager.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { ClientWorldState } from "@client/net/ClientWorldState.ts";
import {
  Interpolator,
  type InterpolationDebugFrame,
} from "@client/net/Interpolator.ts";
import { PixiWorldPresentationSink } from "@client/net/presentation/PixiWorldPresentationSink.ts";
import { WsClient } from "@client/net/WsClient.ts";
import { PixiRenderer } from "@client/render/PixiRenderer.ts";
import {
  getProjectileContent,
  getWeaponContent,
  getWeaponPresentation,
} from "@shared/content/catalog.ts";
import type { GameConfig } from "@shared/config/GameConfig.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { normalizeAngle, shortestAngleDelta } from "@shared/math/angle.ts";
import type {
  InputMovement,
  LobbyStateMessage,
  GameCompleteMessage,
  GameOverMessage,
} from "@shared/net/protocol.ts";
import type {
  DayNightSnapshot,
  ExtractionSnapshot,
  InfrastructureSnapshot,
  WorldSnapshot,
} from "@shared/net/snapshots.ts";
import type { DebugNetworkProfileName } from "@client/net/DebugNetworkSimulator.ts";
import { normalizePlayerName } from "@shared/playerName.ts";

const INPUT_KEEPALIVE_INTERVAL_MS = 100;
const INPUT_THETA_EPSILON = 0.0001;

type SentInputIntent = {
  theta: number;
  movement: InputMovement;
};

/**
 * Coordinates the client runtime while gameplay concerns live in focused
 * modules for session lifecycle, action dispatch, pointer aim, prediction, and
 * placement preview.
 */
export class GameClient {
  public readonly networkClient: WsClient;
  public worldState?: ClientWorldState;
  public readonly inputManager: InputManager;
  public readonly renderer: PixiRenderer;
  public readonly gameConfig: GameConfig;
  public playerEntityId?: number;
  public readonly interpolator: Interpolator;

  private inputBound = false;
  private pointerActionHandler?: (pointer: PointerInput) => boolean;
  private readonly rateMonitor = new ClientRateMonitor();
  private readonly frameLoop = new ClientFrameLoop();
  private readonly heldAttackController = new HeldAttackController({
    tickRate: () => this.gameConfig.tickRate,
  });
  private readonly sessionLifecycle = new ClientSessionLifecycle();
  private readonly pointerAimController = new PointerAimController();
  private readonly placementPreviewController =
    new PlacementPreviewController();
  private readonly inputBlocker = new InputBlocker();
  private readonly suppressionReleaseByReason = new Map<
    MovementSuppressionReason,
    () => void
  >();
  private pendingPlayerName: string | null = null;
  private readonly actionDispatcher: ClientActionDispatcher;
  private readonly presentationSink: PixiWorldPresentationSink;
  private lastInputSentAtMs = Number.NEGATIVE_INFINITY;
  private lastSentInputIntent?: SentInputIntent;
  private sessionReadyHandlers: Array<() => void> = [];
  private worldUpdatedHandlers: Array<() => void> = [];
  private lobbyStateHandlers: Array<(state: LobbyStateMessage) => void> = [];
  private gameCompleteHandlers: Array<(msg: GameCompleteMessage) => void> = [];
  private gameOverHandlers: Array<(msg: GameOverMessage) => void> = [];
  private lobbyState?: LobbyStateMessage;
  private spectateEntityId: number | null = null;
  private latestExtractionState: ExtractionSnapshot | null = null;
  private latestInfrastructureState: InfrastructureSnapshot = {
    energyActive: true,
    commsActive: true,
  };
  private currentWorldId: string | undefined = undefined;
  private latestMinimapPlayers: ReadonlyArray<{
    id: number;
    x: number;
    y: number;
    alive: boolean;
  }> = [];
  private readonly heldMovement: InputMovement = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  constructor(
    gameConfig: GameConfig,
    options: {
      debugHitbox?: boolean;
      debugInterpolationMode?: number;
    } = {},
  ) {
    this.gameConfig = gameConfig;
    this.networkClient = new WsClient();
    this.inputManager = new InputManager();
    this.renderer = new PixiRenderer(this.gameConfig.worldSize);
    this.presentationSink = new PixiWorldPresentationSink(
      this.renderer,
      options,
    );
    this.actionDispatcher = new ClientActionDispatcher({
      networkClient: this.networkClient,
      inputManager: this.inputManager,
      isSessionReady: () => this.isSessionReady(),
      isTransportConnected: () => this.isTransportConnected(),
    });
    this.interpolator = new Interpolator({
      ...this.gameConfig.interpolation,
      expectedSnapshotMs: 1000 / this.gameConfig.tickRate,
    });

    this.networkClient.onSnapshot((snapshot) => this.onSnapshot(snapshot));
    this.networkClient.onWelcome((entityId, worldId) =>
      this.onWelcome(entityId, worldId),
    );
    this.networkClient.onLobbyState((state) => this.onLobbyState(state));
    this.networkClient.onGameComplete((msg) => this.handleGameComplete(msg));
    this.networkClient.onGameOver((msg) => this.handleGameOver(msg));
    this.networkClient.onSpectateUpdate((msg) => {
      this.spectateEntityId = msg.targetEntityId;
    });
    this.networkClient.onClose(() => this.onDisconnected());
    this.inputManager.onMoveIntent(({ key, pressed }) => {
      this.heldMovement[key] = pressed;
      this.sendInputIntentIfNeeded(performance.now(), true);
    });
    this.inputBlocker.onChange((blocked) => {
      this.inputManager.setMovementSuppressed(blocked);
    });
  }

  public bindInput(targetElement: HTMLElement | Window): void {
    if (this.inputBound) {
      return;
    }
    this.inputManager.bind(targetElement);
    this.inputBound = true;
  }

  public onSessionReady(handler: () => void): void {
    this.sessionReadyHandlers.push(handler);
  }

  public onWorldUpdated(handler: () => void): void {
    this.worldUpdatedHandlers.push(handler);
  }

  public isSessionReady(): boolean {
    return this.sessionLifecycle.isSessionReady();
  }

  public isTransportConnected(): boolean {
    return this.networkClient.socket?.readyState === WebSocket.OPEN;
  }

  public onLobbyStateUpdated(
    handler: (state: LobbyStateMessage) => void,
  ): void {
    this.lobbyStateHandlers.push(handler);
  }

  public onGameCompleted(handler: (msg: GameCompleteMessage) => void): void {
    this.gameCompleteHandlers.push(handler);
  }

  public onGameOver(handler: (msg: GameOverMessage) => void): void {
    this.gameOverHandlers.push(handler);
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

  public getSpectateTargetEntityId(): number | null {
    return this.spectateEntityId;
  }

  public getLatestExtractionState(): ExtractionSnapshot | null {
    return this.latestExtractionState;
  }

  public getLatestInfrastructureState(): InfrastructureSnapshot {
    return this.latestInfrastructureState;
  }

  public getLobbyState(): LobbyStateMessage | undefined {
    return this.lobbyState;
  }

  public requestJoinLobby(): void {
    if (!this.isSessionReady() || !this.isTransportConnected()) {
      return;
    }
    this.networkClient.joinLobby();
  }

  public requestJoinLobbyByCode(lobbyCode: string): void {
    if (!this.isSessionReady() || !this.isTransportConnected()) {
      return;
    }
    this.networkClient.joinLobbyByCode(lobbyCode);
  }

  public requestLeaveLobby(): void {
    if (!this.isSessionReady() || !this.isTransportConnected()) {
      return;
    }
    this.networkClient.leaveLobby();
  }

  public requestStartLobby(): void {
    if (!this.isSessionReady() || !this.isTransportConnected()) {
      return;
    }
    this.networkClient.startLobby();
  }

  public async initRenderer(hostElement: HTMLElement): Promise<void> {
    await this.renderer.init(hostElement, this.gameConfig.worldSize);
    this.renderer.invalidateViewRectCache();
    this.pointerAimController.bind({
      renderer: this.renderer,
      isStarted: () => this.sessionLifecycle.isStarted(),
      getPlayerPose: () => this.getLocalPlayerVisualPose(),
      handlePointerInput: (pointer) =>
        this.pointerActionHandler?.(pointer) ?? false,
      startHoldFire: (x, y) => this.inputManager.startHoldFire(x, y),
      updateHoldFireTarget: (x, y) =>
        this.inputManager.updateHoldFireTarget(x, y),
      stopHoldFire: () => this.inputManager.stopHoldFire(),
      onAimChanged: (force) =>
        this.sendInputIntentIfNeeded(performance.now(), force),
    });
  }

  public setWorldSize(worldSize: GameConfig["worldSize"]): void {
    this.gameConfig.worldSize = { ...worldSize };
    this.renderer.setWorldSize(this.gameConfig.worldSize);
    this.placementPreviewController.invalidate({
      spatialIndex: false,
      preview: true,
    });
  }

  public setTickRate(tickRate: number): void {
    if (!Number.isFinite(tickRate) || tickRate <= 0) {
      return;
    }

    this.gameConfig.tickRate = Math.floor(tickRate);
    this.syncInterpolatorConfig();
    this.renderer.setTickRate(this.gameConfig.tickRate);
  }

  public setInterpolationConfig(
    interpolation: GameConfig["interpolation"],
  ): void {
    this.gameConfig.interpolation = {
      ...interpolation,
    };
    this.syncInterpolatorConfig();
  }

  public setPointerActionHandler(
    handler: ((pointer: PointerInput) => boolean) | undefined,
  ): void {
    this.pointerActionHandler = handler;
  }

  public startHoldFire(x: number, y: number): void {
    this.inputManager.startHoldFire(x, y);
  }

  public stopHoldFire(): void {
    this.inputManager.stopHoldFire();
  }

  public queueAttack(x: number, y: number): void {
    const theta = this.computeThetaFromWorldPoint(x, y);
    if (theta === null) {
      return;
    }
    this.sendAttackAction(theta, performance.now());
  }

  public queueCraftItem(itemTypeId: ResourceId): void {
    this.actionDispatcher.queueCraftItem(itemTypeId);
  }

  public queueBuildPlacement(x: number, y: number): void {
    this.actionDispatcher.queueBuildPlacement(x, y);
  }

  public queueInventoryMove(fromSlotIndex: number, toSlotIndex: number): void {
    this.actionDispatcher.queueInventoryMove(fromSlotIndex, toSlotIndex);
  }

  public queueChestMove(
    chestEntityId: number,
    fromSource: "hotbar" | "chest",
    fromIndex: number,
    toSource: "hotbar" | "chest",
    toIndex: number,
  ): void {
    this.actionDispatcher.queueChestMove(
      chestEntityId,
      fromSource,
      fromIndex,
      toSource,
      toIndex,
    );
  }

  public queueSelectHotbarIndex(index: number): void {
    this.actionDispatcher.queueSelectHotbarIndex(index);
  }

  public queueDropSelectedItem(dropWholeStack: boolean): void {
    this.actionDispatcher.queueDropSelectedItem(dropWholeStack);
  }

  public queuePickupNearbyItem(): void {
    this.actionDispatcher.queuePickupNearbyItem();
  }

  public queueRecycle(): void {
    this.actionDispatcher.queueRecycle();
  }

  public queueRepairTower(towerId: number): void {
    this.actionDispatcher.queueRepairTower(towerId);
  }

  public requestRespawn(): void {
    this.actionDispatcher.requestRespawn();
  }

  public sendChat(text: string): void {
    this.actionDispatcher.sendChat(text);
  }

  public acquireMovementSuppression(
    reason: MovementSuppressionReason,
  ): () => void {
    return this.inputBlocker.acquire(reason);
  }

  public setMovementSuppression(
    reason: MovementSuppressionReason,
    suppressed: boolean,
  ): void {
    const release = this.suppressionReleaseByReason.get(reason);
    if (suppressed) {
      if (release) {
        return;
      }
      this.suppressionReleaseByReason.set(
        reason,
        this.inputBlocker.acquire(reason),
      );
      return;
    }

    if (!release) {
      return;
    }
    release();
    this.suppressionReleaseByReason.delete(reason);
  }

  public clearMovementSuppressions(): void {
    for (const release of this.suppressionReleaseByReason.values()) {
      release();
    }
    this.suppressionReleaseByReason.clear();
    this.inputBlocker.clear();
  }

  public isLocalPlayerAlive(): boolean | null {
    const player = this.getLocalPlayerEntity();
    return player ? player.alive : null;
  }

  public getOnlinePlayerNames(): string[] {
    const entities = this.worldState?.clientWorld?.entities.values();
    if (!entities) {
      return [];
    }

    return [...entities]
      .filter(
        (entity): entity is ClientEntity & { name: string } =>
          entity.kind === "player" && typeof entity.name === "string",
      )
      .map((entity) => entity.name)
      .sort((left, right) => left.localeCompare(right));
  }

  public start(url: string, connectOptions: { playerName: string }): void {
    if (this.sessionLifecycle.isStarted() && !this.isSessionReady()) {
      this.resetSessionState(true);
    }
    if (!this.sessionLifecycle.begin()) {
      return;
    }

    this.rateMonitor.reset();
    this.worldState = this.sessionLifecycle.createWorldState(
      this.gameConfig.interpolation.historySize,
    );
    this.pendingPlayerName = connectOptions.playerName;
    this.startFrameLoop();

    this.networkClient.connect(url, {
      playerName: connectOptions.playerName,
      compatHash: this.gameConfig.compatHash,
    });
  }

  public startLobbyPreview(url: string): void {
    if (!this.sessionLifecycle.begin()) {
      return;
    }

    this.rateMonitor.reset();
    this.worldState = this.sessionLifecycle.createWorldState(
      this.gameConfig.interpolation.historySize,
    );
    this.pendingPlayerName = null;
    this.startFrameLoop();
    this.renderer.setPlaygroundMode(true);

    this.networkClient.connect(url, {
      preview: true,
      compatHash: this.gameConfig.compatHash,
    });
  }

  public update(deltaMs: number, frameTimeMs = performance.now()): void {
    const worldState = this.worldState;
    const world = worldState?.clientWorld;
    if (worldState && world) {
      this.interpolator.updateInterpolation(
        worldState,
        frameTimeMs,
        deltaMs,
        this.playerEntityId,
      );

      const player = this.getLocalPlayerEntity();
      const playerPose = this.getLocalPlayerVisualPose();

      // When dead and spectating, redirect the renderer camera to the spectate target
      const isSpectating =
        player?.alive === false && this.spectateEntityId !== null;
      const cameraEntityId = isSpectating
        ? (this.spectateEntityId ?? this.playerEntityId)
        : this.playerEntityId;
      if (this.renderer.playerEntityId !== cameraEntityId) {
        this.renderer.playerEntityId = cameraEntityId;
      }

      this.syncLocalPlayerAimPresentation(playerPose);
      this.presentationSink.update(deltaMs, world);
      const minimapPlayers: Array<{ x: number; y: number; isSelf: boolean }> =
        [];
      for (const player of this.latestMinimapPlayers) {
        if (!player.alive) {
          continue;
        }
        minimapPlayers.push({
          x: player.x,
          y: player.y,
          isSelf: player.id === this.playerEntityId,
        });
      }
      this.renderer.setMinimapPlayers(minimapPlayers);
      this.placementPreviewController.sync({
        renderer: this.renderer,
        world,
        player,
        pointerAimTarget: this.pointerAimController.getAimTarget(),
        gameConfig: this.gameConfig,
      });
      this.syncSniperAimGuide(
        playerPose,
        this.pointerAimController.getAimTarget(),
      );
    } else {
      this.renderer.setSniperAimGuide(null);
      this.renderer.setMinimapPlayers([]);
    }

    this.renderer.update(deltaMs);
  }

  public onSnapshot(snapshot: WorldSnapshot): void {
    const applied = this.worldState?.pushSnapshot(snapshot) ?? {
      applied: false,
    };
    if (!applied.applied) {
      return;
    }

    this.resolveWelcomeFromSnapshot();
    this.latestExtractionState = snapshot.extraction;
    this.latestInfrastructureState = snapshot.infrastructure;
    this.latestMinimapPlayers = snapshot.minimapPlayers ?? [];
    this.renderer.updateExtractionState(snapshot.extraction);
    this.renderer.updateInfrastructureState(snapshot.infrastructure);
    if (snapshot.map !== undefined) {
      this.renderer.updateMapState(snapshot.map);
    }

    this.placementPreviewController.invalidate({
      spatialIndex: true,
      preview: true,
    });
    this.renderer.setGridNightBlend(this.computeNightBlend(snapshot.dayNight));
    this.rateMonitor.recordTickSample(snapshot.tick, performance.now());

    if (this.worldState?.clientWorld) {
      this.presentationSink.syncWorld(this.worldState.clientWorld);
      this.presentationSink.applyEvents(snapshot.events);
    }

    for (const worldUpdatedHandler of this.worldUpdatedHandlers) {
      worldUpdatedHandler();
    }
  }

  public onWelcome(entityId: number, worldId?: string): void {
    if (this.isSessionReady()) {
      const samePlayer = this.playerEntityId === entityId;
      const worldChanged =
        worldId !== undefined && this.currentWorldId !== undefined
          ? worldId !== this.currentWorldId
          : !samePlayer;
      if (!worldChanged) {
        if (worldId !== undefined) {
          this.currentWorldId = worldId;
        }
        return;
      }
      this.resetForInstanceMigration();
    }
    if (worldId !== undefined) {
      this.currentWorldId = worldId;
    }
    this.playerEntityId = entityId;
    this.sessionLifecycle.markSessionReady();
    this.pendingPlayerName = null;
    this.presentationSink.setPlayerEntityId(entityId);
    const inActiveMatch =
      this.lobbyState?.inLobby === true && this.lobbyState?.startedAtMs != null;
    this.renderer.setPlaygroundMode(!inActiveMatch);
    for (const sessionReadyHandler of this.sessionReadyHandlers) {
      sessionReadyHandler();
    }
  }

  public stop(): void {
    this.pointerAimController.unbind();
    this.resetSessionState(true);
  }

  public getMeasuredRates(): PerformanceRateState {
    return this.rateMonitor.getMeasuredRates(performance.now());
  }

  public advanceTime(ms: number): void {
    const frameMs = 1000 / 60;
    const steps = Math.max(1, Math.round(ms / frameMs));
    for (let index = 0; index < steps; index += 1) {
      const frameTimeMs = performance.now() + index * frameMs;
      this.refreshPointerTargetFromScreen();
      this.update(frameMs, frameTimeMs);
      this.refreshPointerTargetFromScreen();
      this.updateHeldAttack(frameTimeMs);
    }
  }

  public getInterpolationDebugLog(): readonly InterpolationDebugFrame[] {
    return this.interpolator.getDebugLog();
  }

  public clearInterpolationDebugLog(): void {
    this.interpolator.clearDebugLog();
  }

  public setDebugNetworkProfile(
    profileName: DebugNetworkProfileName,
    seed = 1,
  ): void {
    this.networkClient.setDebugNetworkProfile(profileName, seed);
  }

  public disableDebugNetworkSimulation(): void {
    this.networkClient.disableDebugNetworkSimulation();
  }

  public setDebugMovementIntent(movement: Partial<InputMovement>): void {
    this.heldMovement.up = movement.up ?? false;
    this.heldMovement.down = movement.down ?? false;
    this.heldMovement.left = movement.left ?? false;
    this.heldMovement.right = movement.right ?? false;
    this.sendInputIntentIfNeeded(performance.now(), true);
  }

  public getNetcodeDebugMetrics(): Record<string, unknown> {
    const interpolation = this.interpolator.getLatestDebugFrame();
    const camera = this.renderer.getCameraDebugState();
    const localPlayer = interpolation?.localPlayer ?? null;
    const localPlayerScreenPosition = localPlayer
      ? this.renderer.worldToScreen(
          localPlayer.renderedX,
          localPlayer.renderedY,
        )
      : null;
    return {
      serverTick: interpolation?.currentServerTick ?? null,
      latestReceivedSnapshotTick:
        interpolation?.latestReceivedSnapshotTick ?? null,
      renderTick: interpolation?.renderTick ?? null,
      snapshotArrivalIntervalMs:
        interpolation?.snapshotArrivalIntervalMs ?? null,
      jitterEstimateMs: interpolation?.jitterEstimateMs ?? null,
      renderDelayTicks: interpolation?.renderDelayTicks ?? null,
      interpolationMode: interpolation?.interpolationMode ?? "none",
      localPlayer,
      localPlayerScreenPosition,
      camera,
      cameraPosition: {
        x: camera.x,
        y: camera.y,
      },
      cameraDelta: {
        x: camera.deltaX,
        y: camera.deltaY,
        screenX: camera.screenDeltaX,
        screenY: camera.screenDeltaY,
      },
      correctionDistance: interpolation?.correctionDistance ?? 0,
      correctionDirection: {
        x: interpolation?.correctionDirectionX ?? 0,
        y: interpolation?.correctionDirectionY ?? 0,
      },
      snapCount: interpolation?.snapCount ?? 0,
      cameraSnapCount: camera.snapCount,
      extrapolatedFrameCount: interpolation?.extrapolatedFrameCount ?? 0,
      heldFrameCount: interpolation?.heldFrameCount ?? 0,
      interpolatedFrameCount: interpolation?.interpolatedFrameCount ?? 0,
      duplicateSnapshotCount: interpolation?.duplicateSnapshotCount ?? 0,
      outOfOrderSnapshotCount: interpolation?.outOfOrderSnapshotCount ?? 0,
      networkSimulation: this.networkClient.getDebugNetworkMetrics(),
    };
  }

  private startFrameLoop(): void {
    if (this.frameLoop.isRunning()) {
      return;
    }

    this.frameLoop.start((timestampMs, deltaMs) => {
      if (!this.sessionLifecycle.isStarted()) {
        this.stopFrameLoop();
        return;
      }

      this.rateMonitor.recordFrameSample(timestampMs);
      this.refreshPointerTargetFromScreen();
      this.update(deltaMs, timestampMs);
      this.refreshPointerTargetFromScreen();
      this.sendInputIntentIfNeeded(timestampMs);
      this.updateHeldAttack(timestampMs);
    });
  }

  private syncInterpolatorConfig(): void {
    this.interpolator.setConfig({
      ...this.gameConfig.interpolation,
      expectedSnapshotMs: 1000 / this.gameConfig.tickRate,
    });
  }

  private stopFrameLoop(): void {
    this.frameLoop.stop();
  }

  private onDisconnected(): void {
    this.resetSessionState(false);
  }

  private onLobbyState(state: LobbyStateMessage): void {
    this.lobbyState = state;
    const inActiveMatch = state.inLobby && state.startedAtMs != null;
    this.renderer.setPlaygroundMode(!inActiveMatch);
    for (const handler of this.lobbyStateHandlers) {
      handler(state);
    }
  }

  private handleGameComplete(msg: GameCompleteMessage): void {
    for (const handler of this.gameCompleteHandlers) {
      handler(msg);
    }
  }

  private handleGameOver(msg: GameOverMessage): void {
    for (const handler of this.gameOverHandlers) {
      handler(msg);
    }
  }

  private resetForInstanceMigration(): void {
    this.worldState?.clear();
    this.worldState = this.sessionLifecycle.createWorldState(
      this.gameConfig.interpolation.historySize,
    );
    this.latestMinimapPlayers = [];
    this.latestInfrastructureState = { energyActive: true, commsActive: true };
    this.latestExtractionState = null;
    this.rateMonitor.reset();
    this.syncInterpolatorConfig();
    this.pointerAimController.reset();
    this.heldAttackController.reset();
    this.inputManager.stopHoldFire();
    this.renderer.invalidateViewRectCache();
    this.presentationSink.setPlayerEntityId(undefined);
    this.presentationSink.reset();
    this.clearMovementSuppressions();
    this.placementPreviewController.reset(this.renderer);
    this.renderer.updateExtractionState(null);
    this.renderer.updateInfrastructureState(this.latestInfrastructureState);
    this.renderer.updateMapState(null);
    this.renderer.setSniperAimGuide(null);
  }

  private resetSessionState(disconnectTransport: boolean): void {
    this.sessionLifecycle.reset();
    this.pointerAimController.reset();
    this.heldAttackController.reset();
    this.rateMonitor.reset();
    this.stopFrameLoop();
    this.inputManager.stopHoldFire();
    this.renderer.invalidateViewRectCache();
    this.clearMovementSuppressions();
    this.lobbyState = undefined;
    this.heldMovement.up = false;
    this.heldMovement.down = false;
    this.heldMovement.left = false;
    this.heldMovement.right = false;
    this.lastInputSentAtMs = Number.NEGATIVE_INFINITY;
    this.lastSentInputIntent = undefined;

    if (disconnectTransport) {
      this.networkClient.disconnect();
    }

    this.worldState?.clear();
    this.worldState = undefined;
    this.playerEntityId = undefined;
    this.pendingPlayerName = null;
    this.spectateEntityId = null;
    this.latestMinimapPlayers = [];
    this.latestInfrastructureState = { energyActive: true, commsActive: true };
    this.latestExtractionState = null;
    this.presentationSink.setPlayerEntityId(undefined);
    this.presentationSink.reset();
    this.placementPreviewController.reset(this.renderer);
    this.renderer.updateExtractionState(null);
    this.renderer.updateInfrastructureState(this.latestInfrastructureState);
    this.renderer.updateMapState(null);
    this.renderer.setSniperAimGuide(null);
  }

  private getLocalPlayerEntity(): ClientEntity | undefined {
    if (this.playerEntityId === undefined) {
      return undefined;
    }

    return this.worldState?.clientWorld?.entities.get(this.playerEntityId);
  }

  private resolveWelcomeFromSnapshot(): void {
    if (this.isSessionReady()) {
      return;
    }
    const pendingName = this.pendingPlayerName;
    if (!pendingName) {
      return;
    }
    const world = this.worldState?.clientWorld;
    if (!world) {
      return;
    }
    const normalizedName = normalizePlayerName(pendingName, "");
    const matches = [...world.entities.values()].filter((entity) => {
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
    this.onWelcome(matchedPlayer.id);
  }

  private getLocalPlayerVisualPose(): {
    x: number;
    y: number;
    rotation: number;
  } | null {
    const player = this.getLocalPlayerEntity();
    if (!player) {
      return null;
    }
    return {
      x: player.x,
      y: player.y,
      rotation: player.rotation,
    };
  }

  private syncLocalPlayerAimPresentation(
    playerPose: { x: number; y: number; rotation: number } | null,
  ): void {
    if (this.playerEntityId === undefined) {
      return;
    }

    if (!playerPose || !this.getLocalPlayerEntity()?.alive) {
      this.presentationSink.setPresentationOverride(this.playerEntityId, null);
      return;
    }

    const localAimTheta = this.pointerAimController.computeAimThetaFromScreen();
    if (localAimTheta === null) {
      this.presentationSink.setPresentationOverride(this.playerEntityId, null);
      return;
    }

    this.presentationSink.setPresentationOverride(this.playerEntityId, {
      x: playerPose.x,
      y: playerPose.y,
      rotation: localAimTheta,
    });
  }

  private refreshPointerTargetFromScreen(): void {
    const aimTarget =
      this.pointerAimController.refreshPointerTargetFromScreen();
    if (!aimTarget) {
      return;
    }
    this.inputManager.updateHoldFireTarget(aimTarget.x, aimTarget.y);
  }

  private sendAttackAction(theta: number, now: number): boolean {
    const activeWeapon = this.getLocalActiveWeapon();
    if (!activeWeapon) {
      return false;
    }
    if (!this.heldAttackController.canLikelyExecuteAttack(activeWeapon)) {
      return false;
    }

    this.actionDispatcher.queueAttack(theta);
    if (this.playerEntityId !== undefined && this.worldState?.clientWorld) {
      this.presentationSink.playAttackAnimation(
        this.playerEntityId,
        this.worldState.clientWorld,
      );
    }
    this.heldAttackController.onAttackSent(now, activeWeapon);
    return true;
  }

  private sendInputIntentIfNeeded(now: number, force = false): void {
    if (!this.isSessionReady() || !this.isTransportConnected()) {
      return;
    }

    const player = this.getLocalPlayerEntity();
    if (!player?.alive) {
      return;
    }

    const visualPose = this.getLocalPlayerVisualPose();
    const theta =
      this.pointerAimController.computeAimTheta(visualPose) ??
      visualPose?.rotation ??
      player.rotation;
    const movement = { ...this.heldMovement };
    const inputChanged = this.hasInputIntentChanged(theta, movement);
    const keepaliveDue =
      now - this.lastInputSentAtMs >= INPUT_KEEPALIVE_INTERVAL_MS;
    if (!force && !inputChanged && !keepaliveDue) {
      return;
    }

    const seq = this.inputManager.nextSequence();
    const clientTimeMs = performance.now();
    this.networkClient.sendInputIntent(seq, clientTimeMs, theta, movement);
    this.lastInputSentAtMs = now;
    this.lastSentInputIntent = {
      theta,
      movement,
    };
  }

  private hasInputIntentChanged(
    theta: number,
    movement: InputMovement,
  ): boolean {
    const last = this.lastSentInputIntent;
    if (!last) {
      return true;
    }
    return (
      Math.abs(shortestAngleDelta(last.theta, theta)) > INPUT_THETA_EPSILON ||
      last.movement.up !== movement.up ||
      last.movement.down !== movement.down ||
      last.movement.left !== movement.left ||
      last.movement.right !== movement.right
    );
  }

  private updateHeldAttack(now: number): void {
    const holdFireTarget = this.inputManager.getHoldFireTarget();
    if (
      !holdFireTarget ||
      !this.isSessionReady() ||
      !this.isTransportConnected()
    ) {
      return;
    }

    const localPlayer = this.getLocalPlayerEntity();
    const activeWeapon = this.getLocalActiveWeapon();
    if (!localPlayer?.alive || !activeWeapon) {
      return;
    }
    if (!this.heldAttackController.canSendHeldAttack(now, activeWeapon)) {
      return;
    }

    const theta = this.pointerAimController.computeAimTheta(
      this.getLocalPlayerVisualPose(),
    );
    if (theta === null) {
      return;
    }
    this.sendAttackAction(theta, now);
  }

  private getLocalActiveWeapon(): LocalWeaponState | undefined {
    const player = this.getLocalPlayerEntity();
    return player?.equippedItem;
  }

  private computeNightBlend(dayNight: DayNightSnapshot): number {
    const phaseDuration =
      dayNight.phase === "night"
        ? dayNight.nightDurationMs
        : dayNight.dayDurationMs;
    if (phaseDuration <= 0) {
      return dayNight.phase === "night" ? 1 : 0;
    }

    const elapsed = Math.max(
      0,
      Math.min(dayNight.phaseElapsedMs, phaseDuration),
    );
    const transitionMs = Math.max(
      1000,
      Math.min(15000, Math.floor(phaseDuration * 0.2)),
    );

    if (elapsed >= phaseDuration - transitionMs) {
      const t = (elapsed - (phaseDuration - transitionMs)) / transitionMs;
      return dayNight.phase === "night" ? 1 - t : t;
    }

    return dayNight.phase === "night" ? 1 : 0;
  }

  private computeThetaFromWorldPoint(
    x: number,
    y: number,
    playerPose = this.getLocalPlayerVisualPose(),
  ): number | null {
    if (!playerPose) {
      return null;
    }

    const deltaX = x - playerPose.x;
    const deltaY = y - playerPose.y;
    if (Math.hypot(deltaX, deltaY) <= Number.EPSILON) {
      return null;
    }

    return normalizeAngle(Math.atan2(deltaY, deltaX));
  }

  private syncSniperAimGuide(
    playerPose: { x: number; y: number } | null,
    aimTarget: { x: number; y: number } | undefined,
  ): void {
    const activeWeapon = this.getLocalActiveWeapon();
    if (
      !playerPose ||
      !aimTarget ||
      !activeWeapon ||
      !shouldShowAimGuide(activeWeapon.typeId, this.gameConfig.worldSize)
    ) {
      this.renderer.setSniperAimGuide(null);
      return;
    }

    const directionX = aimTarget.x - playerPose.x;
    const directionY = aimTarget.y - playerPose.y;
    if (Math.hypot(directionX, directionY) <= Number.EPSILON) {
      this.renderer.setSniperAimGuide(null);
      return;
    }

    this.renderer.setSniperAimGuide({
      originX: playerPose.x,
      originY: playerPose.y,
      directionX,
      directionY,
    });
  }
}

function shouldShowAimGuide(
  weaponTypeId: ResourceId,
  worldSize: { w: number; h: number },
): boolean {
  const presentation = getWeaponPresentation(weaponTypeId);
  if (presentation !== undefined) {
    return presentation.aimGuide === "sniper";
  }

  const weaponContent = getWeaponContent(weaponTypeId);
  if (weaponContent?.attackStyle !== "shoot") {
    return false;
  }

  const projectileContent = getProjectileContent(
    weaponContent.projectileTypeId,
  );
  if (!projectileContent) {
    return false;
  }

  return projectileContent.range >= Math.hypot(worldSize.w, worldSize.h);
}
