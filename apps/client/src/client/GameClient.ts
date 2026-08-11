import type {
  PerformanceRateState,
  PointerInput,
} from "@client/client/clientTypes.ts";
import { HeldAttackController } from "@client/client/HeldAttackController.ts";
import { ClientRateMonitor } from "@client/client/ClientRateMonitor.ts";
import { ClientInputController } from "@client/client/input/ClientInputController.ts";
import { PlacementPreviewController } from "@client/client/building/PlacementPreviewController.ts";
import { PointerAimController } from "@client/client/input/PointerAimController.ts";
import type { MovementSuppressionReason } from "@client/input/MovementSuppressionReason.ts";
import { InputBlocker } from "@client/input/InputBlocker.ts";
import { InputManager } from "@client/input/InputManager.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
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
  ActionMessage,
  CraftTargetInput,
  InputMovement,
  LobbyStateMessage,
  GameCompleteMessage,
  GameOverMessage,
} from "@shared/net/protocol.ts";
import type {
  ExtractionSnapshot,
  InfrastructureSnapshot,
  WorldSnapshot,
} from "@shared/net/snapshots.ts";
import type { DebugNetworkProfileName } from "@client/net/DebugNetworkSimulator.ts";
import { normalizePlayerName } from "@shared/playerName.ts";

type ActionPayload = ActionMessage extends infer Message
  ? Message extends ActionMessage
    ? Omit<Message, "t" | "seq">
    : never
  : never;

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
  private animationFrameId: number | undefined;
  private lastAnimationFrameTime: number | undefined;
  private readonly rateMonitor = new ClientRateMonitor();
  private readonly heldAttackController = new HeldAttackController({
    tickRate: () =>
      this.gameConfig.tickRate * this.gameConfig.simulationSpeedMultiplier,
  });
  private started = false;
  private sessionReady = false;
  private pendingPlayerName: string | null = null;
  private currentWorldId: string | undefined;
  private spectateEntityId: number | null = null;
  private lobbyState: LobbyStateMessage | undefined;
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
  public worldState: ClientWorldState | undefined;
  public playerEntityId: number | undefined;
  private readonly pointerAimController = new PointerAimController();
  private readonly placementPreviewController =
    new PlacementPreviewController();
  private readonly inputBlocker = new InputBlocker();
  private readonly suppressionReleaseByReason = new Map<
    MovementSuppressionReason,
    () => void
  >();
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
    this.interpolator = new Interpolator({
      ...this.gameConfig.interpolation,
      expectedSnapshotMs: 1000 / this.gameConfig.tickRate,
    });
    this.inputController = new ClientInputController({
      inputManager: this.inputManager,
      networkClient: this.networkClient,
      pointerAimController: this.pointerAimController,
      sendAttack: (theta) => this.sendAction({ action: "attack", theta }),
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
      this.spectateEntityId = msg.targetEntityId;
    });
    this.networkClient.onClose(() => this.onDisconnected());
    this.inputController.bindMoveIntent();
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
    return this.sessionReady;
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
      this.lobbyState?.inLobby === true && this.lobbyState.startedAtMs != null
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

  public getLatestExtractionState() {
    return this.latestExtractionState;
  }

  public getLatestInfrastructureState() {
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
      isStarted: () => this.started,
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

    this.gameConfig.tickRate = tickRate;
    this.syncInterpolatorConfig();
    this.renderer.setTickRate(this.gameConfig.tickRate);
  }

  public setSimulationSpeedMultiplier(simulationSpeedMultiplier: number): void {
    if (
      !Number.isFinite(simulationSpeedMultiplier) ||
      simulationSpeedMultiplier <= 0
    ) {
      return;
    }

    this.gameConfig.simulationSpeedMultiplier = simulationSpeedMultiplier;
    this.renderer.setSimulationSpeedMultiplier(simulationSpeedMultiplier);
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
    this.sendAction({ action: "craft", craft: { itemTypeId, target } });
  }

  public queueBuildPlacement(x: number, y: number): void {
    this.sendAction({ action: "build", build: { x, y } });
  }

  public queueInventoryMove(fromSlotIndex: number, toSlotIndex: number): void {
    this.sendAction({
      action: "inventoryMove",
      inventoryMove: { fromSlotIndex, toSlotIndex },
    });
  }

  public queueChestMove(
    chestEntityId: number,
    fromSource: "hotbar" | "chest",
    fromIndex: number,
    toSource: "hotbar" | "chest",
    toIndex: number,
  ): void {
    this.sendAction({
      action: "chestMove",
      chestMove: { chestEntityId, fromSource, fromIndex, toSource, toIndex },
    });
  }

  public queueArmorMove(
    fromSource: "hotbar" | "armor",
    fromIndex: number,
    toSource: "hotbar" | "armor",
    toIndex: number,
  ): void {
    this.sendAction({
      action: "armorMove",
      armorMove: { fromSource, fromIndex, toSource, toIndex },
    });
  }

  public queueSelectHotbarIndex(index: number): void {
    this.sendAction({ action: "selectHotbar", index });
  }

  public queueDropSelectedItem(dropWholeStack: boolean): void {
    this.sendAction({ action: "drop", dropWholeStack });
  }

  public queueReloadSelectedWeapon(): void {
    this.sendAction({ action: "reload" });
  }

  public queuePickupNearbyItem(): void {
    this.sendAction({ action: "pickup" });
  }

  public queueRecycle(): void {
    this.sendAction({ action: "recycle" });
  }

  public queueRecycleHotbarIndex(index: number): void {
    this.queueSelectHotbarIndex(index);
    this.queueRecycle();
  }

  public queueRepairTower(towerId: number): void {
    this.sendAction({ action: "repair_tower", towerId });
  }

  public queueUseConsumable(typeId: ResourceId): void {
    this.sendAction({ action: "useConsumable", typeId });
  }

  public requestRespawn(): void {
    if (this.canSend()) {
      this.networkClient.sendRespawn();
    }
  }

  public sendChat(text: string): void {
    if (this.canSend()) {
      this.networkClient.sendChat(text);
    }
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
    if (this.started && !this.isSessionReady()) {
      this.resetSessionState(true);
    }
    if (!this.beginSession()) {
      return;
    }

    this.rateMonitor.reset();
    this.worldState = new ClientWorldState(
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
    if (!this.beginSession()) {
      return;
    }

    this.rateMonitor.reset();
    this.worldState = new ClientWorldState(
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

      const isSpectating =
        player?.alive === false && this.spectateEntityId !== null;
      const cameraEntityId = isSpectating
        ? (this.spectateEntityId ?? this.playerEntityId)
        : this.playerEntityId;
      if (this.renderer.playerEntityId !== cameraEntityId) {
        this.renderer.playerEntityId = cameraEntityId;
      }

      this.inputController.syncLocalPlayerAimPresentation(playerPose);
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
    this.renderer.setGridNightBlend(computeClientNightBlend(snapshot.dayNight));
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
    this.sessionReady = true;
    this.pendingPlayerName = null;
    this.presentationSink.setPlayerEntityId(entityId);
    this.renderer.setPlaygroundMode(!this.isInActiveMatch());
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

  public getEffectiveSimulationTickRate(): number {
    return this.gameConfig.tickRate * this.gameConfig.simulationSpeedMultiplier;
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
    if (this.animationFrameId !== undefined) {
      return;
    }
    const tick = (timestampMs: number): void => {
      if (this.animationFrameId === undefined) {
        return;
      }
      if (!this.started) {
        this.stopFrameLoop();
        return;
      }
      const deltaMs =
        this.lastAnimationFrameTime === undefined
          ? 0
          : timestampMs - this.lastAnimationFrameTime;
      this.lastAnimationFrameTime = timestampMs;
      this.rateMonitor.recordFrameSample(timestampMs);
      this.inputController.refreshPointerTargetFromScreen();
      this.update(deltaMs, timestampMs);
      this.inputController.refreshPointerTargetFromScreen();
      this.inputController.sendInputIntentIfNeeded(timestampMs);
      this.inputController.updateHeldAttack(timestampMs);
      if (this.started) {
        this.animationFrameId = window.requestAnimationFrame(tick);
      }
    };
    this.lastAnimationFrameTime = undefined;
    this.animationFrameId = window.requestAnimationFrame(tick);
  }

  private stopFrameLoop(): void {
    if (this.animationFrameId !== undefined) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
    this.lastAnimationFrameTime = undefined;
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
    this.lobbyState = state;
    this.renderer.setPlaygroundMode(
      !(state.inLobby && state.startedAtMs != null),
    );
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
    this.worldState = new ClientWorldState(
      this.gameConfig.interpolation.historySize,
    );
    this.latestMinimapPlayers = [];
    this.latestInfrastructureState = { energyActive: true, commsActive: true };
    this.latestExtractionState = null;
    this.resetRuntimeState();
    this.resetPresentationState();
  }

  private resetSessionState(disconnectTransport: boolean): void {
    this.started = false;
    this.sessionReady = false;
    this.resetRuntimeState();
    this.stopFrameLoop();
    this.lobbyState = undefined;
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
    this.resetPresentationState();
  }

  private resetRuntimeState(): void {
    this.pointerAimController.reset();
    this.heldAttackController.reset();
    this.rateMonitor.reset();
    this.syncInterpolatorConfig();
    this.inputController.reset();
    this.renderer.invalidateViewRectCache();
    this.clearMovementSuppressions();
  }

  private resetPresentationState(): void {
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
    if (this.sessionReady || !this.pendingPlayerName) {
      return;
    }
    const entities = this.worldState?.clientWorld?.entities.values();
    if (!entities) {
      return;
    }
    const name = normalizePlayerName(this.pendingPlayerName, "");
    const matches = [...entities].filter(
      (entity) =>
        entity.kind === "player" &&
        entity.name === (name || `player-${entity.id}`),
    );
    if (matches.length === 1) {
      this.onWelcome(matches[0]!.id);
    }
  }

  private beginSession(): boolean {
    if (this.started) {
      return false;
    }
    this.started = true;
    this.sessionReady = false;
    return true;
  }

  private canSend(): boolean {
    return this.isSessionReady() && this.isTransportConnected();
  }

  private sendAction(payload: ActionPayload): void {
    if (!this.canSend()) {
      return;
    }
    this.networkClient.sendAction({
      t: "action",
      seq: this.inputManager.nextSequence(),
      ...payload,
    } as ActionMessage);
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
