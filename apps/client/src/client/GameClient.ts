import { ClientFrameController } from "@client/client/ClientFrameController.ts";
import type {
  PerformanceRateState,
  PointerInput,
} from "@client/client/clientTypes.ts";
import { HeldAttackController } from "@client/client/HeldAttackController.ts";
import { ClientInputController } from "@client/client/input/ClientInputController.ts";
import { PlacementPreviewController } from "@client/client/building/PlacementPreviewController.ts";
import { PointerAimController } from "@client/client/input/PointerAimController.ts";
import { ClientActionDispatcher } from "@client/client/network/ClientActionDispatcher.ts";
import {
  ClientSessionLifecycle,
  type SessionLifecycleResetHooks,
} from "@client/client/session/ClientSessionLifecycle.ts";
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
import { computeClientNightBlend } from "@shared/gameplay/dayNightBlend.ts";
import type {
  CraftTargetInput,
  InputMovement,
  LobbyStateMessage,
  GameCompleteMessage,
  GameOverMessage,
} from "@shared/net/protocol.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import type { DebugNetworkProfileName } from "@client/net/DebugNetworkSimulator.ts";

/**
 * Coordinates the client runtime while gameplay concerns live in focused
 * modules for session lifecycle, action dispatch, pointer aim, prediction, and
 * placement preview.
 */
export class GameClient {
  public readonly networkClient: WsClient;
  public readonly inputManager: InputManager;
  public readonly renderer: PixiRenderer;
  public readonly gameConfig: GameConfig;
  public readonly interpolator: Interpolator;

  private inputBound = false;
  private pointerActionHandler?: (pointer: PointerInput) => boolean;
  private readonly frameController = new ClientFrameController();
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
  private readonly actionDispatcher: ClientActionDispatcher;
  private readonly presentationSink: PixiWorldPresentationSink;
  private readonly inputController: ClientInputController;
  private sessionReadyHandlers: Array<() => void> = [];
  private worldUpdatedHandlers: Array<() => void> = [];
  private lobbyStateHandlers: Array<(state: LobbyStateMessage) => void> = [];
  private gameCompleteHandlers: Array<(msg: GameCompleteMessage) => void> = [];
  private gameOverHandlers: Array<(msg: GameOverMessage) => void> = [];

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
    this.inputController = new ClientInputController({
      inputManager: this.inputManager,
      networkClient: this.networkClient,
      pointerAimController: this.pointerAimController,
      actionDispatcher: this.actionDispatcher,
      heldAttackController: this.heldAttackController,
      presentationSink: this.presentationSink,
      isSessionReady: () => this.isSessionReady(),
      isTransportConnected: () => this.isTransportConnected(),
      getLocalPlayerEntity: () => this.getLocalPlayerEntity(),
      getLocalPlayerVisualPose: () => this.getLocalPlayerVisualPose(),
      getPlayerEntityId: () => this.playerEntityId,
      getWorldState: () => this.worldState,
    });

    this.networkClient.onSnapshot((snapshot) => this.onSnapshot(snapshot));
    this.networkClient.onWelcome((entityId, worldId) =>
      this.onWelcome(entityId, worldId),
    );
    this.networkClient.onLobbyState((state) => this.onLobbyState(state));
    this.networkClient.onGameComplete((msg) => this.handleGameComplete(msg));
    this.networkClient.onGameOver((msg) => this.handleGameOver(msg));
    this.networkClient.onSpectateUpdate((msg) => {
      this.sessionLifecycle.setSpectateEntityId(msg.targetEntityId);
    });
    this.networkClient.onClose(() => this.onDisconnected());
    this.inputController.bindMoveIntent();
    this.inputBlocker.onChange((blocked) => {
      this.inputManager.setMovementSuppressed(blocked);
    });
  }

  public get worldState(): ClientWorldState | undefined {
    return this.sessionLifecycle.getWorldState();
  }

  public set worldState(worldState: ClientWorldState | undefined) {
    this.sessionLifecycle.setWorldState(worldState);
  }

  public get playerEntityId(): number | undefined {
    return this.sessionLifecycle.getPlayerEntityId();
  }

  public set playerEntityId(playerEntityId: number | undefined) {
    this.sessionLifecycle.setPlayerEntityId(playerEntityId);
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
    return this.sessionLifecycle.isInActiveMatch();
  }

  public getSpectateTargetName(): string | null {
    return this.sessionLifecycle.getSpectateTargetName();
  }

  public getSpectateTargetEntityId(): number | null {
    return this.sessionLifecycle.getSpectateEntityId();
  }

  public getLatestExtractionState() {
    return this.sessionLifecycle.getLatestExtractionState();
  }

  public getLatestInfrastructureState() {
    return this.sessionLifecycle.getLatestInfrastructureState();
  }

  public getLobbyState(): LobbyStateMessage | undefined {
    return this.sessionLifecycle.getLobbyState();
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
        this.inputController.sendInputIntentIfNeeded(performance.now(), force),
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
    this.inputController.queueAttackFromWorldPoint(x, y);
  }

  public queueCraftItem(
    itemTypeId: ResourceId,
    target?: CraftTargetInput,
  ): void {
    this.actionDispatcher.queueCraftItem(itemTypeId, target);
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

  public queueArmorMove(
    fromSource: "hotbar" | "armor",
    fromIndex: number,
    toSource: "hotbar" | "armor",
    toIndex: number,
  ): void {
    this.actionDispatcher.queueArmorMove(
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

  public queueReloadSelectedWeapon(): void {
    this.actionDispatcher.queueReloadSelectedWeapon();
  }

  public queuePickupNearbyItem(): void {
    this.actionDispatcher.queuePickupNearbyItem();
  }

  public queueRecycle(): void {
    this.actionDispatcher.queueRecycle();
  }

  public queueRecycleHotbarIndex(index: number): void {
    this.actionDispatcher.queueRecycleHotbarIndex(index);
  }

  public queueRepairTower(towerId: number): void {
    this.actionDispatcher.queueRepairTower(towerId);
  }

  public queueUseConsumable(typeId: ResourceId): void {
    this.actionDispatcher.queueUseConsumable(typeId);
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

    this.frameController.reset();
    this.worldState = this.sessionLifecycle.createWorldState(
      this.gameConfig.interpolation.historySize,
    );
    this.sessionLifecycle.setPendingPlayerName(connectOptions.playerName);
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

    this.frameController.reset();
    this.worldState = this.sessionLifecycle.createWorldState(
      this.gameConfig.interpolation.historySize,
    );
    this.sessionLifecycle.setPendingPlayerName(null);
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

      const isSpectating =
        player?.alive === false &&
        this.sessionLifecycle.getSpectateEntityId() !== null;
      const cameraEntityId = isSpectating
        ? (this.sessionLifecycle.getSpectateEntityId() ?? this.playerEntityId)
        : this.playerEntityId;
      if (this.renderer.playerEntityId !== cameraEntityId) {
        this.renderer.playerEntityId = cameraEntityId;
      }

      this.inputController.syncLocalPlayerAimPresentation(playerPose);
      this.presentationSink.update(deltaMs, world);
      const minimapPlayers: Array<{ x: number; y: number; isSelf: boolean }> =
        [];
      for (const player of this.sessionLifecycle.getLatestMinimapPlayers()) {
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
    this.sessionLifecycle.setLatestExtractionState(snapshot.extraction);
    this.sessionLifecycle.setLatestInfrastructureState(snapshot.infrastructure);
    this.sessionLifecycle.setLatestMinimapPlayers(
      snapshot.minimapPlayers ?? [],
    );
    this.renderer.updateExtractionState(snapshot.extraction);
    this.renderer.updateInfrastructureState(snapshot.infrastructure);
    if (snapshot.map !== undefined) {
      this.renderer.updateMapState(snapshot.map);
    }

    this.placementPreviewController.invalidate({
      spatialIndex: true,
      preview: true,
    });
    this.renderer.setGridNightBlend(computeClientNightBlend(snapshot.dayNight));
    this.frameController.recordTickSample(snapshot.tick, performance.now());

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
        worldId !== undefined &&
        this.sessionLifecycle.getCurrentWorldId() !== undefined
          ? worldId !== this.sessionLifecycle.getCurrentWorldId()
          : !samePlayer;
      if (!worldChanged) {
        if (worldId !== undefined) {
          this.sessionLifecycle.setCurrentWorldId(worldId);
        }
        return;
      }
      this.resetForInstanceMigration();
    }

    if (worldId !== undefined) {
      this.sessionLifecycle.setCurrentWorldId(worldId);
    }
    this.playerEntityId = entityId;
    this.sessionLifecycle.markSessionReady();
    this.sessionLifecycle.setPendingPlayerName(null);
    this.presentationSink.setPlayerEntityId(entityId);
    this.renderer.setPlaygroundMode(!this.sessionLifecycle.isInActiveMatch());
    for (const sessionReadyHandler of this.sessionReadyHandlers) {
      sessionReadyHandler();
    }
  }

  public stop(): void {
    this.pointerAimController.unbind();
    this.resetSessionState(true);
  }

  public getMeasuredRates(): PerformanceRateState {
    return this.frameController.getMeasuredRates(performance.now());
  }

  public advanceTime(ms: number): void {
    const frameMs = 1000 / 60;
    const steps = Math.max(1, Math.round(ms / frameMs));
    for (let index = 0; index < steps; index += 1) {
      const frameTimeMs = performance.now() + index * frameMs;
      this.inputController.refreshPointerTargetFromScreen();
      this.update(frameMs, frameTimeMs);
      this.inputController.refreshPointerTargetFromScreen();
      this.inputController.updateHeldAttack(frameTimeMs);
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
    this.inputController.setDebugMovementIntent(movement);
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
    this.frameController.start({
      isStarted: () => this.sessionLifecycle.isStarted(),
      onFrame: (timestampMs, deltaMs) => {
        this.inputController.refreshPointerTargetFromScreen();
        this.update(deltaMs, timestampMs);
      },
      onAfterFrame: (timestampMs) => {
        this.inputController.refreshPointerTargetFromScreen();
        this.inputController.sendInputIntentIfNeeded(timestampMs);
        this.inputController.updateHeldAttack(timestampMs);
      },
    });
  }

  private syncInterpolatorConfig(): void {
    this.interpolator.setConfig({
      ...this.gameConfig.interpolation,
      expectedSnapshotMs: 1000 / this.gameConfig.tickRate,
    });
  }

  private onDisconnected(): void {
    this.resetSessionState(false);
  }

  private onLobbyState(state: LobbyStateMessage): void {
    this.sessionLifecycle.notifyLobbyState(state, (nextState) => {
      this.renderer.setPlaygroundMode(
        !(nextState.inLobby && nextState.startedAtMs != null),
      );
      for (const handler of this.lobbyStateHandlers) {
        handler(nextState);
      }
    });
  }

  private handleGameComplete(msg: GameCompleteMessage): void {
    this.sessionLifecycle.notifyGameComplete(msg, this.gameCompleteHandlers);
  }

  private handleGameOver(msg: GameOverMessage): void {
    this.sessionLifecycle.notifyGameOver(msg, this.gameOverHandlers);
  }

  private getSessionResetHooks(): SessionLifecycleResetHooks {
    return {
      resetPointerAim: () => this.pointerAimController.reset(),
      resetHeldAttack: () => this.heldAttackController.reset(),
      resetInput: () => this.inputController.reset(),
      resetFrameController: () => {
        this.frameController.reset();
        this.syncInterpolatorConfig();
      },
      stopFrameLoop: () => this.frameController.stop(),
      clearMovementSuppressions: () => this.clearMovementSuppressions(),
      invalidateRendererView: () => this.renderer.invalidateViewRectCache(),
      resetPresentation: () => {
        this.presentationSink.setPlayerEntityId(undefined);
        this.presentationSink.reset();
      },
      resetPlacementPreview: () =>
        this.placementPreviewController.reset(this.renderer),
      resetRendererWorldState: () => {
        this.renderer.updateExtractionState(null);
        this.renderer.updateInfrastructureState(
          this.sessionLifecycle.getLatestInfrastructureState(),
        );
        this.renderer.updateMapState(null);
        this.renderer.setSniperAimGuide(null);
      },
      disconnectTransport: () => this.networkClient.disconnect(),
    };
  }

  private resetForInstanceMigration(): void {
    this.sessionLifecycle.resetForInstanceMigration(
      this.gameConfig.interpolation.historySize,
      this.getSessionResetHooks(),
    );
    this.worldState = this.sessionLifecycle.getWorldState();
  }

  private resetSessionState(disconnectTransport: boolean): void {
    this.sessionLifecycle.resetSessionState(
      disconnectTransport,
      this.getSessionResetHooks(),
    );
  }

  private getLocalPlayerEntity(): ClientEntity | undefined {
    if (this.playerEntityId === undefined) {
      return undefined;
    }

    return this.worldState?.clientWorld?.entities.get(this.playerEntityId);
  }

  private resolveWelcomeFromSnapshot(): void {
    this.sessionLifecycle.resolveWelcomeFromSnapshot(
      () => this.worldState?.clientWorld?.entities.values(),
      (entityId) => this.onWelcome(entityId),
    );
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

  private syncSniperAimGuide(
    playerPose: { x: number; y: number } | null,
    aimTarget: { x: number; y: number } | undefined,
  ): void {
    const activeWeapon = this.getLocalPlayerEntity()?.equippedItem;
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
