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
import { InputManager } from "@client/input/InputManager.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { ClientWorld } from "@client/net/ClientWorld.ts";
import {
  Interpolator,
  type InterpolationDebugFrame,
} from "@client/net/Interpolator.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { WsClient } from "@client/net/WsClient.ts";
import { PixiRenderer } from "@client/render/PixiRenderer.ts";
import { getEntityContent, getItemContent } from "@shared/content/catalog.ts";
import type { GameConfig } from "@shared/config/GameConfig.ts";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import {
  getHitboxBounds,
  offsetHitboxBounds,
  resolveHitboxRects,
  type HitboxBounds,
  type HitboxRect,
} from "@shared/geometry/hitbox.ts";
import { BUILD_PLACEMENT_MAX_DISTANCE } from "@shared/gameplay/building.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  lerpAngle,
  normalizeAngle,
  shortestAngleDelta,
} from "@shared/math/angle.ts";
import type { ActionMessage, MoveIntentKey } from "@shared/net/protocol.ts";
import type { DayNightSnapshot, WorldSnapshot } from "@shared/net/snapshots.ts";

type AimTarget = {
  x: number;
  y: number;
};

type HeldMovementState = Record<MoveIntentKey, boolean>;

type LocalPlayerTruthState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
};

type CachedPlacementBuildProfile = {
  itemTypeId: ResourceId;
  buildsEntityTypeId: ResourceId;
  hitboxProfiles: Record<string, readonly HitboxRect[]>;
  activeHitboxProfile?: string;
  previewProfile: readonly HitboxRect[];
  previewLocalBounds: HitboxBounds;
};

const PLACEMENT_SPATIAL_CELL_SIZE = 160;
const PLACEMENT_KEY_OFFSET = 1 << 15;
const PLACEMENT_KEY_STRIDE = 1 << 16;
const AIM_SEND_EPSILON = 0.0025;
const LOCAL_PLAYER_RECONCILE_SNAP_DISTANCE = 96;
const LOCAL_PLAYER_RECONCILE_FOLLOW_SHARPNESS = 14;
const PLAYER_DRIVE_ACCELERATION_MULTIPLIER = 0.45;
const PLAYER_DRIVE_ACCELERATION_MIN = 4;
const CONFUSION_SPEED_MULTIPLIER = 0.4;

/**
 * Coordinates client networking, snapshots, interpolation, and renderer sync.
 */
export class GameClient {
  public networkClient: WsClient;
  public worldState?: ClientWorldState;
  public inputManager: InputManager;
  public renderer: PixiRenderer;
  public gameConfig: GameConfig;
  public playerEntityId?: number;
  public interpolator: Interpolator;

  private inputBound = false;
  private rendererPointerBound = false;
  private started = false;
  private sessionReady = false;
  private readonly rateMonitor = new ClientRateMonitor();
  private readonly frameLoop = new ClientFrameLoop();
  private readonly heldAttackController = new HeldAttackController({
    tickRate: () => this.gameConfig.tickRate,
  });
  private readonly debugHitbox: boolean;
  private readonly debugInterpolationMode: number;
  private pointerActionHandler?: (pointer: PointerInput) => boolean;
  private sessionReadyHandlers: Array<() => void> = [];
  private worldUpdatedHandlers: Array<() => void> = [];
  private pointerAimTarget?: AimTarget;
  private localPlayerTruth?: LocalPlayerTruthState;
  private pointerClientX: number | null = null;
  private pointerClientY: number | null = null;
  private lastSentAimTheta?: number;
  private lastSentAimAtMs = Number.NEGATIVE_INFINITY;
  private placementIndexDirty = true;
  private placementIndexedWorld?: ClientWorld;
  private readonly placementSpatial = new Map<number, ClientEntity[]>();
  private readonly placementWorkingCandidates: ClientEntity[] = [];
  private readonly placementCandidateMarkers = new Map<number, number>();
  private placementCandidateMarker = 0;
  private placementProfileCache: CachedPlacementBuildProfile | undefined;
  private pointerViewTarget: HTMLCanvasElement | null = null;
  private readonly heldMovement: HeldMovementState = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.started || event.button !== 0 || !event.isPrimary) {
      return;
    }

    this.pointerClientX = event.clientX;
    this.pointerClientY = event.clientY;
    const screenPoint = this.renderer.clientToScreen(
      event.clientX,
      event.clientY,
    );
    const aimTarget = this.computeAimTargetFromPointer(
      event.clientX,
      event.clientY,
    );
    this.pointerAimTarget = aimTarget;
    const handled = this.pointerActionHandler?.({
      kind: "down",
      screenX: screenPoint.x,
      screenY: screenPoint.y,
      worldX: aimTarget.x,
      worldY: aimTarget.y,
      shiftKey: event.shiftKey,
    });
    if (!handled) {
      this.inputManager.startHoldFire(aimTarget.x, aimTarget.y);
    }
    this.sendAimIfNeeded(performance.now(), true);
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.started || !event.isPrimary) {
      return;
    }
    this.pointerClientX = event.clientX;
    this.pointerClientY = event.clientY;
    const screenPoint = this.renderer.clientToScreen(
      event.clientX,
      event.clientY,
    );
    const aimTarget = this.computeAimTargetFromPointer(
      event.clientX,
      event.clientY,
    );
    this.pointerAimTarget = aimTarget;
    const handled = this.pointerActionHandler?.({
      kind: "move",
      screenX: screenPoint.x,
      screenY: screenPoint.y,
      worldX: aimTarget.x,
      worldY: aimTarget.y,
      shiftKey: event.shiftKey,
    });
    if (!handled) {
      this.inputManager.updateHoldFireTarget(aimTarget.x, aimTarget.y);
    }
    this.sendAimIfNeeded(performance.now(), true);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }
    this.pointerClientX = event.clientX;
    this.pointerClientY = event.clientY;
    const screenPoint = this.renderer.clientToScreen(
      event.clientX,
      event.clientY,
    );
    const aimTarget = this.computeAimTargetFromPointer(
      event.clientX,
      event.clientY,
    );
    this.pointerAimTarget = aimTarget;
    this.pointerActionHandler?.({
      kind: "up",
      screenX: screenPoint.x,
      screenY: screenPoint.y,
      worldX: aimTarget.x,
      worldY: aimTarget.y,
      shiftKey: event.shiftKey,
    });
    this.inputManager.stopHoldFire();
    this.sendAimIfNeeded(performance.now(), true);
  };

  private readonly handlePointerViewRectInvalidation = (): void => {
    this.renderer.invalidateViewRectCache();
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
    this.interpolator = new Interpolator({
      snapDistance: this.gameConfig.interpolation.snapDistance,
      expectedSnapshotMs: 1000 / this.gameConfig.tickRate,
      tickDurationSmoothing:
        this.gameConfig.interpolation.tickDurationSmoothing,
      renderDelaySmoothing: this.gameConfig.interpolation.renderDelaySmoothing,
      minRenderDelayTicks: this.gameConfig.interpolation.minRenderDelayTicks,
      maxRenderDelayTicks: this.gameConfig.interpolation.maxRenderDelayTicks,
      maxExtrapolationTicks:
        this.gameConfig.interpolation.maxExtrapolationTicks,
      tickDurationMinFactor:
        this.gameConfig.interpolation.tickDurationMinFactor,
      tickDurationMaxFactor:
        this.gameConfig.interpolation.tickDurationMaxFactor,
      arrivalEwmaSmoothing: this.gameConfig.interpolation.arrivalEwmaSmoothing,
      jitterEwmaSmoothing: this.gameConfig.interpolation.jitterEwmaSmoothing,
      jitterBufferMultiplier:
        this.gameConfig.interpolation.jitterBufferMultiplier,
      jitterBufferSafetyMs: this.gameConfig.interpolation.jitterBufferSafetyMs,
      maxDebugLogEntries: this.gameConfig.interpolation.maxDebugLogEntries,
      correctionFollowSharpness:
        this.gameConfig.interpolation.correctionFollowSharpness,
      correctionEpsilon: this.gameConfig.interpolation.correctionEpsilon,
      correctionFrameScaleMin:
        this.gameConfig.interpolation.correctionFrameScaleMin,
      correctionFrameScaleMax:
        this.gameConfig.interpolation.correctionFrameScaleMax,
    });
    this.debugHitbox = options.debugHitbox ?? false;
    this.debugInterpolationMode = options.debugInterpolationMode ?? 0;

    this.networkClient.onSnapshot((snapshot) => this.onSnapshot(snapshot));
    this.networkClient.onWelcome((entityId) => this.onWelcome(entityId));
    this.networkClient.onClose(() => this.onDisconnected());
    this.inputManager.onMoveIntent(({ key, pressed }) => {
      this.heldMovement[key] = pressed;
      if (!this.sessionReady || !this.isTransportConnected()) {
        return;
      }
      this.networkClient.sendMoveIntent(
        this.inputManager.nextSequence(),
        key,
        pressed,
      );
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

  public async initRenderer(hostElement: HTMLElement): Promise<void> {
    await this.renderer.init(hostElement, this.gameConfig.worldSize);
    this.renderer.invalidateViewRectCache();

    if (!this.rendererPointerBound) {
      const view = this.renderer.getView();
      this.pointerViewTarget = view;
      view?.addEventListener("pointerdown", this.handlePointerDown);
      view?.addEventListener("pointermove", this.handlePointerMove);
      window.addEventListener("pointerup", this.handlePointerUp);
      window.addEventListener("pointercancel", this.handlePointerUp);
      window.addEventListener("resize", this.handlePointerViewRectInvalidation);
      window.addEventListener(
        "scroll",
        this.handlePointerViewRectInvalidation,
        true,
      );
      this.rendererPointerBound = true;
    }
  }

  public setWorldSize(worldSize: GameConfig["worldSize"]): void {
    this.gameConfig.worldSize = { ...worldSize };
    this.renderer.setWorldSize(this.gameConfig.worldSize);
    this.placementIndexDirty = true;
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
    this.sendAction({
      t: "action",
      seq: this.inputManager.nextSequence(),
      action: "craft",
      craft: { itemTypeId },
    });
  }

  public queueBuildPlacement(x: number, y: number): void {
    this.sendAction({
      t: "action",
      seq: this.inputManager.nextSequence(),
      action: "build",
      build: { x, y },
    });
  }

  public queueInventoryMove(fromSlotIndex: number, toSlotIndex: number): void {
    this.sendAction({
      t: "action",
      seq: this.inputManager.nextSequence(),
      action: "inventoryMove",
      inventoryMove: {
        fromSlotIndex,
        toSlotIndex,
      },
    });
  }

  public queueSelectHotbarIndex(index: number): void {
    this.sendAction({
      t: "action",
      seq: this.inputManager.nextSequence(),
      action: "selectHotbar",
      index,
    });
  }

  public requestRespawn(): void {
    if (!this.sessionReady || !this.isTransportConnected()) {
      return;
    }
    this.networkClient.sendRespawn();
  }

  public setMovementSuppressed(suppressed: boolean): void {
    this.inputManager.setMovementSuppressed(suppressed);
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

  public start(
    url: string,
    connectOptions: { googleIdToken?: string; playerName: string },
  ): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.sessionReady = false;
    this.rateMonitor.reset();
    this.worldState = new ClientWorldState(
      this.renderer,
      this.debugHitbox,
      this.debugInterpolationMode,
      this.gameConfig.interpolation.historySize,
    );
    this.startFrameLoop();

    this.networkClient.connect(url, {
      googleIdToken: connectOptions.googleIdToken,
      playerName: connectOptions.playerName,
      compatHash: this.gameConfig.compatHash,
    });
  }

  public update(deltaMs: number, frameTimeMs = performance.now()): void {
    if (this.worldState) {
      this.interpolator.updateInterpolation(
        this.worldState,
        frameTimeMs,
        deltaMs,
        this.playerEntityId,
      );
      this.updateLocalPlayerTruth(deltaMs);
      this.worldState.clientWorld?.update(deltaMs);
      this.syncPlacementPreview();
    }
    this.renderer.update(deltaMs);
  }

  public onSnapshot(snapshot: WorldSnapshot): void {
    const applied = this.worldState?.pushSnapshot(snapshot) ?? false;
    if (!applied) {
      return;
    }

    this.placementIndexDirty = true;

    this.renderer.setGridNightBlend(this.computeNightBlend(snapshot.dayNight));
    this.rateMonitor.recordTickSample(snapshot.tick, performance.now());
    for (const worldUpdatedHandler of this.worldUpdatedHandlers) {
      worldUpdatedHandler();
    }
  }

  public onWelcome(entityId: number): void {
    this.playerEntityId = entityId;
    this.sessionReady = true;
    this.renderer.setPlayerEntityId(entityId);
    for (const sessionReadyHandler of this.sessionReadyHandlers) {
      sessionReadyHandler();
    }
  }

  public stop(): void {
    if (this.rendererPointerBound) {
      this.pointerViewTarget?.removeEventListener(
        "pointerdown",
        this.handlePointerDown,
      );
      this.pointerViewTarget?.removeEventListener(
        "pointermove",
        this.handlePointerMove,
      );
      window.removeEventListener("pointerup", this.handlePointerUp);
      window.removeEventListener("pointercancel", this.handlePointerUp);
      window.removeEventListener(
        "resize",
        this.handlePointerViewRectInvalidation,
      );
      window.removeEventListener(
        "scroll",
        this.handlePointerViewRectInvalidation,
        true,
      );
      this.rendererPointerBound = false;
      this.pointerViewTarget = null;
    }
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
      // Refresh after camera update so attacks use the current viewport.
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

  private startFrameLoop(): void {
    if (this.frameLoop.isRunning()) {
      return;
    }

    this.frameLoop.start((timestampMs, deltaMs) => {
      if (!this.started) {
        this.stopFrameLoop();
        return;
      }

      this.rateMonitor.recordFrameSample(timestampMs);
      this.refreshPointerTargetFromScreen();
      this.update(deltaMs, timestampMs);
      // Refresh after camera update so attacks use the current viewport.
      this.refreshPointerTargetFromScreen();
      this.sendAimIfNeeded(timestampMs);
      this.updateHeldAttack(timestampMs);
    });
  }

  private syncInterpolatorConfig(): void {
    this.interpolator.setConfig({
      snapDistance: this.gameConfig.interpolation.snapDistance,
      expectedSnapshotMs: 1000 / this.gameConfig.tickRate,
      tickDurationSmoothing:
        this.gameConfig.interpolation.tickDurationSmoothing,
      renderDelaySmoothing: this.gameConfig.interpolation.renderDelaySmoothing,
      minRenderDelayTicks: this.gameConfig.interpolation.minRenderDelayTicks,
      maxRenderDelayTicks: this.gameConfig.interpolation.maxRenderDelayTicks,
      maxExtrapolationTicks:
        this.gameConfig.interpolation.maxExtrapolationTicks,
      tickDurationMinFactor:
        this.gameConfig.interpolation.tickDurationMinFactor,
      tickDurationMaxFactor:
        this.gameConfig.interpolation.tickDurationMaxFactor,
      arrivalEwmaSmoothing: this.gameConfig.interpolation.arrivalEwmaSmoothing,
      jitterEwmaSmoothing: this.gameConfig.interpolation.jitterEwmaSmoothing,
      jitterBufferMultiplier:
        this.gameConfig.interpolation.jitterBufferMultiplier,
      jitterBufferSafetyMs: this.gameConfig.interpolation.jitterBufferSafetyMs,
      maxDebugLogEntries: this.gameConfig.interpolation.maxDebugLogEntries,
      correctionFollowSharpness:
        this.gameConfig.interpolation.correctionFollowSharpness,
      correctionEpsilon: this.gameConfig.interpolation.correctionEpsilon,
      correctionFrameScaleMin:
        this.gameConfig.interpolation.correctionFrameScaleMin,
      correctionFrameScaleMax:
        this.gameConfig.interpolation.correctionFrameScaleMax,
    });
  }

  private stopFrameLoop(): void {
    this.frameLoop.stop();
  }

  private onDisconnected(): void {
    this.resetSessionState(false);
  }

  private resetSessionState(disconnectTransport: boolean): void {
    this.started = false;
    this.sessionReady = false;
    this.pointerAimTarget = undefined;
    this.localPlayerTruth = undefined;
    this.pointerClientX = null;
    this.pointerClientY = null;
    this.lastSentAimTheta = undefined;
    this.lastSentAimAtMs = Number.NEGATIVE_INFINITY;
    this.heldMovement.up = false;
    this.heldMovement.down = false;
    this.heldMovement.left = false;
    this.heldMovement.right = false;
    this.renderer.invalidateViewRectCache();
    this.heldAttackController.reset();
    this.stopFrameLoop();
    this.rateMonitor.reset();
    if (disconnectTransport) {
      this.networkClient.disconnect();
    }
    this.worldState?.clear();
    this.playerEntityId = undefined;
    this.renderer.setPlayerEntityId(undefined);
    this.renderer.setPlacementPreview(null);
    this.placementSpatial.clear();
    this.placementWorkingCandidates.length = 0;
    this.placementCandidateMarkers.clear();
    this.placementCandidateMarker = 0;
    this.placementIndexDirty = true;
    this.placementIndexedWorld = undefined;
    this.placementProfileCache = undefined;
  }

  private getLocalPlayerEntity(): ClientEntity | undefined {
    if (this.playerEntityId === undefined) {
      return undefined;
    }

    return this.worldState?.clientWorld?.entities.get(this.playerEntityId);
  }

  private refreshPointerTargetFromScreen(): void {
    if (this.pointerClientX === null || this.pointerClientY === null) {
      return;
    }
    const aimTarget = this.computeAimTargetFromPointer(
      this.pointerClientX,
      this.pointerClientY,
    );
    this.pointerAimTarget = aimTarget;
    this.inputManager.updateHoldFireTarget(aimTarget.x, aimTarget.y);
  }

  private sendAction(actionMessage: ActionMessage): void {
    if (!this.sessionReady || !this.isTransportConnected()) {
      return;
    }
    this.networkClient.sendAction(actionMessage);
  }

  private sendAttackAction(theta: number, now: number): boolean {
    const activeWeapon = this.getLocalActiveWeapon();
    if (!activeWeapon) {
      return false;
    }
    if (!this.heldAttackController.canLikelyExecuteAttack(activeWeapon)) {
      return false;
    }

    this.sendAction({
      t: "action",
      seq: this.inputManager.nextSequence(),
      action: "attack",
      theta,
    });
    this.worldState?.clientWorld?.playAttackAnimation(this.playerEntityId);
    this.heldAttackController.onAttackSent(now, activeWeapon);
    return true;
  }

  private updateHeldAttack(now: number): void {
    const holdFireTarget = this.inputManager.getHoldFireTarget();
    if (!holdFireTarget || !this.sessionReady || !this.isTransportConnected()) {
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

    const theta = this.computeLocalAimTheta();
    if (theta === null) {
      return;
    }
    this.sendAttackAction(theta, now);
  }

  private computeAimTargetFromPointer(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const cursorWorld = this.renderer.screenToWorld(clientX, clientY);
    const centerWorld = this.renderer.getViewportCenterWorld();
    if (!centerWorld) {
      return cursorWorld;
    }

    const playerPose = this.getLocalPlayerVisualPose();
    if (!playerPose) {
      return cursorWorld;
    }

    const deltaX = cursorWorld.x - centerWorld.x;
    const deltaY = cursorWorld.y - centerWorld.y;
    return { x: playerPose.x + deltaX, y: playerPose.y + deltaY };
  }

  private getLocalActiveWeapon(): LocalWeaponState | undefined {
    const player = this.getLocalPlayerEntity();
    const inventory = player?.inventory;
    if (!inventory) {
      return undefined;
    }

    const activeSlot = inventory.hotbarSlots[inventory.selectedHotbarIndex];
    if (activeSlot?.kind !== "weapon") {
      return undefined;
    }

    return activeSlot;
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

  private updateLocalPlayerTruth(deltaMs: number): void {
    const world = this.worldState?.clientWorld;
    const player = this.getLocalPlayerEntity();
    if (!world || !player?.alive || this.playerEntityId === undefined) {
      if (this.playerEntityId !== undefined) {
        world?.setPresentationOverride(this.playerEntityId, null);
      }
      this.localPlayerTruth = undefined;
      return;
    }

    const dt = Math.max(0, deltaMs) / 1000;
    const authoritativeX = player.serverX;
    const authoritativeY = player.serverY;
    const current = this.localPlayerTruth ?? {
      x: authoritativeX,
      y: authoritativeY,
      vx: player.vx,
      vy: player.vy,
      rotation: player.rotation,
    };
    const simulated = this.simulateLocalPlayerTruth(current, player, deltaMs);
    let nextX = simulated.x;
    let nextY = simulated.y;
    let nextVx = simulated.vx;
    let nextVy = simulated.vy;
    const errorDistance = Math.hypot(
      authoritativeX - nextX,
      authoritativeY - nextY,
    );
    if (errorDistance > LOCAL_PLAYER_RECONCILE_SNAP_DISTANCE) {
      nextX = authoritativeX;
      nextY = authoritativeY;
      nextVx = player.vx;
      nextVy = player.vy;
    } else {
      const followT =
        1 - Math.exp(-LOCAL_PLAYER_RECONCILE_FOLLOW_SHARPNESS * dt);
      nextX = lerp(nextX, authoritativeX, followT);
      nextY = lerp(nextY, authoritativeY, followT);
      nextVx = lerp(nextVx, player.vx, followT);
      nextVy = lerp(nextVy, player.vy, followT);
    }

    const localAimTheta = this.computeLocalAimTheta();
    const nextRotation =
      localAimTheta ?? lerpAngle(current.rotation, player.rotation, 0.35);
    this.localPlayerTruth = {
      x: nextX,
      y: nextY,
      vx: nextVx,
      vy: nextVy,
      rotation: nextRotation,
    };
    world.setPresentationOverride(this.playerEntityId, this.localPlayerTruth);
  }

  private simulateLocalPlayerTruth(
    current: LocalPlayerTruthState,
    player: ClientEntity,
    deltaMs: number,
  ): LocalPlayerTruthState {
    const tickMs = 1000 / Math.max(1, this.gameConfig.tickRate);
    const frameTicks = Math.max(0, deltaMs) / tickMs;
    if (frameTicks <= 0) {
      return current;
    }

    const moveSpeed = player.moveSpeed ?? 0;
    const movementBlocked = this.isLocalMovementBlocked(player);
    const moveVelocity = movementBlocked
      ? { x: 0, y: 0 }
      : this.computeLocalDesiredVelocity(
          moveSpeed * this.resolveLocalMovementSpeedMultiplier(player),
        );
    const driveAccelerationPerTick = Math.max(
      PLAYER_DRIVE_ACCELERATION_MIN,
      moveSpeed * PLAYER_DRIVE_ACCELERATION_MULTIPLIER,
    );
    const simulatedVelocity = advanceVelocityToward(
      current.vx,
      current.vy,
      moveVelocity.x,
      moveVelocity.y,
      driveAccelerationPerTick * frameTicks,
    );

    return {
      ...current,
      x: current.x + simulatedVelocity.x * frameTicks,
      y: current.y + simulatedVelocity.y * frameTicks,
      vx: simulatedVelocity.x,
      vy: simulatedVelocity.y,
    };
  }

  private computeLocalDesiredVelocity(moveSpeed: number): {
    x: number;
    y: number;
  } {
    let moveX = 0;
    let moveY = 0;
    if (this.heldMovement.left) {
      moveX -= 1;
    }
    if (this.heldMovement.right) {
      moveX += 1;
    }
    if (this.heldMovement.up) {
      moveY -= 1;
    }
    if (this.heldMovement.down) {
      moveY += 1;
    }

    const magnitude = Math.hypot(moveX, moveY);
    if (magnitude <= Number.EPSILON) {
      return { x: 0, y: 0 };
    }

    return {
      x: (moveX / magnitude) * moveSpeed,
      y: (moveY / magnitude) * moveSpeed,
    };
  }

  private isLocalMovementBlocked(player: ClientEntity): boolean {
    return (
      player.activeEffects?.some((effect) => effect.typeId === "effect:stunned") ??
      false
    );
  }

  private resolveLocalMovementSpeedMultiplier(player: ClientEntity): number {
    let multiplier = 1;
    for (const effect of player.activeEffects ?? []) {
      if (effect.typeId === "effect:confusion") {
        multiplier *= CONFUSION_SPEED_MULTIPLIER;
      }
    }
    return multiplier;
  }

  private getLocalPlayerVisualPose(): {
    x: number;
    y: number;
    rotation: number;
  } | null {
    if (this.localPlayerTruth) {
      return this.localPlayerTruth;
    }

    const player = this.getLocalPlayerEntity();
    if (!player) {
      return null;
    }

    return {
      x: player.serverX,
      y: player.serverY,
      rotation: player.rotation,
    };
  }

  private computeLocalAimTheta(): number | null {
    if (!this.pointerAimTarget) {
      return null;
    }

    const playerPose = this.getLocalPlayerVisualPose();
    if (!playerPose) {
      return null;
    }

    return this.computeThetaFromWorldPoint(
      this.pointerAimTarget.x,
      this.pointerAimTarget.y,
      playerPose,
    );
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

  private sendAimIfNeeded(now: number, force = false): void {
    if (!this.sessionReady || !this.isTransportConnected()) {
      return;
    }

    const theta = this.computeLocalAimTheta();
    if (theta === null) {
      return;
    }

    const changed =
      this.lastSentAimTheta === undefined ||
      Math.abs(shortestAngleDelta(this.lastSentAimTheta, theta)) >
        AIM_SEND_EPSILON;
    const intervalMs = 1000 / Math.max(1, this.gameConfig.tickRate);
    const due = now - this.lastSentAimAtMs >= intervalMs;
    if (!changed || (!force && !due)) {
      return;
    }

    this.networkClient.sendAim(this.inputManager.nextSequence(), theta);
    this.lastSentAimTheta = theta;
    this.lastSentAimAtMs = now;
  }

  private syncPlacementPreview(): void {
    const world = this.worldState?.clientWorld;
    const player = this.getLocalPlayerEntity();
    if (!world || !player || !player.alive) {
      this.renderer.setPlacementPreview(null);
      return;
    }

    const inventory = player.inventory;
    if (!inventory) {
      this.renderer.setPlacementPreview(null);
      return;
    }

    const selectedSlot = inventory.hotbarSlots[inventory.selectedHotbarIndex];
    if (selectedSlot?.kind !== "buildable") {
      this.placementProfileCache = undefined;
      this.renderer.setPlacementPreview(null);
      return;
    }

    const pointer = this.pointerAimTarget;
    if (!pointer) {
      this.renderer.setPlacementPreview(null);
      return;
    }

    const buildProfile = this.resolvePlacementBuildProfile(selectedSlot.typeId);
    if (!buildProfile) {
      this.renderer.setPlacementPreview(null);
      return;
    }

    const previewRects = resolveHitboxRects(
      pointer.x,
      pointer.y,
      buildProfile.previewProfile,
    );
    const previewBounds = offsetHitboxBounds(
      buildProfile.previewLocalBounds,
      pointer.x,
      pointer.y,
    );

    let valid = true;
    const distanceToPointer = Math.hypot(
      pointer.x - player.x,
      pointer.y - player.y,
    );
    if (distanceToPointer > BUILD_PLACEMENT_MAX_DISTANCE) {
      valid = false;
    }

    if (
      previewBounds.minX < 0 ||
      previewBounds.minY < 0 ||
      previewBounds.maxX > this.gameConfig.worldSize.w ||
      previewBounds.maxY > this.gameConfig.worldSize.h
    ) {
      valid = false;
    }

    if (valid) {
      this.ensurePlacementSpatialIndex(world);
      const candidates = this.queryPlacementCandidates(previewBounds);
      for (const entity of candidates) {
        if (this.isPlacementBlockingEntity(entity, player.id)) {
          const entityRects = resolveHitboxRects(
            entity.x,
            entity.y,
            entity.hitboxes,
          );
          if (doResolvedRectSetsOverlap(previewRects, entityRects)) {
            valid = false;
            break;
          }
        }
      }
    }

    this.renderer.setPlacementPreview({
      visible: true,
      worldX: pointer.x,
      worldY: pointer.y,
      valid,
      typeId: buildProfile.buildsEntityTypeId,
      hitboxProfiles: buildProfile.hitboxProfiles,
      activeHitboxProfile: buildProfile.activeHitboxProfile,
    });
  }

  private resolvePlacementBuildProfile(
    selectedItemTypeId: ResourceId,
  ): CachedPlacementBuildProfile | undefined {
    if (this.placementProfileCache?.itemTypeId === selectedItemTypeId) {
      return this.placementProfileCache;
    }

    const itemContent = getItemContent(selectedItemTypeId);
    const buildsEntityTypeId = itemContent?.buildsEntityTypeId;
    if (!buildsEntityTypeId) {
      this.placementProfileCache = undefined;
      return undefined;
    }

    const buildEntityContent = getEntityContent(buildsEntityTypeId);
    const hitboxProfiles = buildEntityContent?.hitboxProfiles;
    if (!hitboxProfiles) {
      this.placementProfileCache = undefined;
      return undefined;
    }

    const activeProfileName = buildEntityContent.activeHitboxProfile;
    const previewProfile =
      (activeProfileName && hitboxProfiles[activeProfileName]) ??
      Object.values(hitboxProfiles)[0];
    if (!previewProfile) {
      this.placementProfileCache = undefined;
      return undefined;
    }

    this.placementProfileCache = {
      itemTypeId: selectedItemTypeId,
      buildsEntityTypeId,
      hitboxProfiles,
      activeHitboxProfile: activeProfileName,
      previewProfile,
      previewLocalBounds: getHitboxBounds(previewProfile),
    };
    return this.placementProfileCache;
  }

  private ensurePlacementSpatialIndex(world: ClientWorld): void {
    if (!this.placementIndexDirty && this.placementIndexedWorld === world) {
      return;
    }

    this.placementSpatial.clear();
    for (const entity of world.entities.values()) {
      if (!entity.alive) {
        continue;
      }
      if (entity.kind === "projectile" || entity.kind === "pickup") {
        continue;
      }
      const entityContent = getEntityContent(entity.typeId);
      if (entityContent?.collisionMode === "none") {
        continue;
      }

      const bounds = offsetHitboxBounds(
        entity.hitboxBounds,
        entity.x,
        entity.y,
      );
      const minCellX = Math.floor(bounds.minX / PLACEMENT_SPATIAL_CELL_SIZE);
      const maxCellX = Math.floor(bounds.maxX / PLACEMENT_SPATIAL_CELL_SIZE);
      const minCellY = Math.floor(bounds.minY / PLACEMENT_SPATIAL_CELL_SIZE);
      const maxCellY = Math.floor(bounds.maxY / PLACEMENT_SPATIAL_CELL_SIZE);

      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
          const key = getPlacementCellKey(cellX, cellY);
          let bucket = this.placementSpatial.get(key);
          if (!bucket) {
            bucket = [];
            this.placementSpatial.set(key, bucket);
          }
          bucket.push(entity);
        }
      }
    }

    this.placementIndexDirty = false;
    this.placementIndexedWorld = world;
  }

  private queryPlacementCandidates(
    previewBounds: HitboxBounds,
  ): readonly ClientEntity[] {
    this.bumpPlacementCandidateMarker();
    this.placementWorkingCandidates.length = 0;

    const minCellX = Math.floor(
      previewBounds.minX / PLACEMENT_SPATIAL_CELL_SIZE,
    );
    const maxCellX = Math.floor(
      previewBounds.maxX / PLACEMENT_SPATIAL_CELL_SIZE,
    );
    const minCellY = Math.floor(
      previewBounds.minY / PLACEMENT_SPATIAL_CELL_SIZE,
    );
    const maxCellY = Math.floor(
      previewBounds.maxY / PLACEMENT_SPATIAL_CELL_SIZE,
    );

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const bucket = this.placementSpatial.get(
          getPlacementCellKey(cellX, cellY),
        );
        if (!bucket) {
          continue;
        }
        for (const candidate of bucket) {
          if (
            this.placementCandidateMarkers.get(candidate.id) ===
            this.placementCandidateMarker
          ) {
            continue;
          }
          this.placementCandidateMarkers.set(
            candidate.id,
            this.placementCandidateMarker,
          );
          this.placementWorkingCandidates.push(candidate);
        }
      }
    }

    return this.placementWorkingCandidates;
  }

  private bumpPlacementCandidateMarker(): void {
    this.placementCandidateMarker += 1;
    if (this.placementCandidateMarker >= Number.MAX_SAFE_INTEGER) {
      this.placementCandidateMarker = 1;
      this.placementCandidateMarkers.clear();
    }
  }

  private isPlacementBlockingEntity(
    entity: ClientEntity,
    localPlayerId: number,
  ): boolean {
    return entity.id !== localPlayerId;
  }
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function advanceVelocityToward(
  currentVx: number,
  currentVy: number,
  targetVx: number,
  targetVy: number,
  maxDelta: number,
): { x: number; y: number } {
  if (!Number.isFinite(maxDelta) || maxDelta <= 0) {
    return { x: currentVx, y: currentVy };
  }

  const deltaX = targetVx - currentVx;
  const deltaY = targetVy - currentVy;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= Number.EPSILON || distance <= maxDelta) {
    return { x: targetVx, y: targetVy };
  }

  return {
    x: currentVx + (deltaX / distance) * maxDelta,
    y: currentVy + (deltaY / distance) * maxDelta,
  };
}

function getPlacementCellKey(cellX: number, cellY: number): number {
  return (
    (cellX + PLACEMENT_KEY_OFFSET) * PLACEMENT_KEY_STRIDE +
    (cellY + PLACEMENT_KEY_OFFSET)
  );
}
