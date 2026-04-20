import { ClientFrameLoop } from "@client/client/ClientFrameLoop.ts";
import { ClientRateMonitor } from "@client/client/ClientRateMonitor.ts";
import {
  HeldAttackController,
  type LocalWeaponState,
} from "@client/client/HeldAttackController.ts";
import { InputManager } from "@client/input/InputManager.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
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
} from "@shared/geometry/hitbox.ts";
import { BUILD_PLACEMENT_MAX_DISTANCE } from "@shared/gameplay/building.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { ActionMessage } from "@shared/net/protocol.ts";
import type { DayNightSnapshot, WorldSnapshot } from "@shared/net/snapshots.ts";

export type PerformanceRateState = {
  frameRate: number | null;
  tickRate: number | null;
};

export type PointerInput = {
  kind: "down" | "move" | "up";
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
  shiftKey: boolean;
};

type AimTarget = {
  x: number;
  y: number;
};

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
  private pointerClientX: number | null = null;
  private pointerClientY: number | null = null;

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
    const worldPoint = this.renderer.screenToWorld(
      event.clientX,
      event.clientY,
    );
    this.pointerAimTarget = { x: worldPoint.x, y: worldPoint.y };
    const handled = this.pointerActionHandler?.({
      kind: "down",
      screenX: screenPoint.x,
      screenY: screenPoint.y,
      worldX: worldPoint.x,
      worldY: worldPoint.y,
      shiftKey: event.shiftKey,
    });
    if (!handled) {
      this.inputManager.startHoldFire(worldPoint.x, worldPoint.y);
    }
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
    const worldPoint = this.renderer.screenToWorld(
      event.clientX,
      event.clientY,
    );
    this.pointerAimTarget = { x: worldPoint.x, y: worldPoint.y };
    const handled = this.pointerActionHandler?.({
      kind: "move",
      screenX: screenPoint.x,
      screenY: screenPoint.y,
      worldX: worldPoint.x,
      worldY: worldPoint.y,
      shiftKey: event.shiftKey,
    });
    if (!handled) {
      this.inputManager.updateHoldFireTarget(worldPoint.x, worldPoint.y);
    }
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
    const worldPoint = this.renderer.screenToWorld(
      event.clientX,
      event.clientY,
    );
    this.pointerAimTarget = { x: worldPoint.x, y: worldPoint.y };
    this.pointerActionHandler?.({
      kind: "up",
      screenX: screenPoint.x,
      screenY: screenPoint.y,
      worldX: worldPoint.x,
      worldY: worldPoint.y,
      shiftKey: event.shiftKey,
    });
    this.inputManager.stopHoldFire();
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
      if (!this.sessionReady || !this.isTransportConnected()) {
        return;
      }
      this.networkClient.sendMoveIntent(
        this.inputManager.nextSequence(),
        key,
        pressed,
      );
    });

    window.gameClient = this;
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

    if (!this.rendererPointerBound) {
      const view = this.renderer.getView();
      view?.addEventListener("pointerdown", this.handlePointerDown);
      view?.addEventListener("pointermove", this.handlePointerMove);
      window.addEventListener("pointerup", this.handlePointerUp);
      window.addEventListener("pointercancel", this.handlePointerUp);
      this.rendererPointerBound = true;
    }
  }

  public setWorldSize(worldSize: GameConfig["worldSize"]): void {
    this.gameConfig.worldSize = { ...worldSize };
    this.renderer.setWorldSize(this.gameConfig.worldSize);
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
    this.worldState?.setSnapshotHistoryLimit(this.gameConfig.interpolation.historySize);
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
    this.sendAttackAction(x, y, performance.now());
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
      .filter((entity) => entity.kind === "player" && entity.name)
      .map((entity) => entity.name as string)
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
      this.syncLocalAimRotation();
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
      this.updateHeldAttack(frameTimeMs);
      this.update(frameMs, frameTimeMs);
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
      this.updateHeldAttack(timestampMs);
      this.update(deltaMs, timestampMs);
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
  }

  private getLocalPlayerEntity(): ClientEntity | undefined {
    if (this.playerEntityId === undefined) {
      return undefined;
    }

    return this.worldState?.clientWorld?.entities.get(this.playerEntityId);
  }

  private syncLocalAimRotation(): void {
    if (!this.pointerAimTarget) {
      return;
    }

    const player = this.getLocalPlayerEntity();
    if (!player?.alive) {
      return;
    }

    const deltaX = this.pointerAimTarget.x - player.x;
    const deltaY = this.pointerAimTarget.y - player.y;
    if (Math.hypot(deltaX, deltaY) <= Number.EPSILON) {
      return;
    }

    player.rotation = Math.atan2(deltaY, deltaX);
  }

  private refreshPointerTargetFromScreen(): void {
    if (this.pointerClientX === null || this.pointerClientY === null) {
      return;
    }
    const worldPoint = this.renderer.screenToWorld(
      this.pointerClientX,
      this.pointerClientY,
    );
    this.pointerAimTarget = { x: worldPoint.x, y: worldPoint.y };
    this.inputManager.updateHoldFireTarget(worldPoint.x, worldPoint.y);
  }

  private sendAction(actionMessage: ActionMessage): void {
    if (!this.sessionReady || !this.isTransportConnected()) {
      return;
    }
    this.networkClient.sendAction(actionMessage);
  }

  private sendAttackAction(x: number, y: number, now: number): boolean {
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
      aim: { x, y },
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

    this.sendAttackAction(holdFireTarget.x, holdFireTarget.y, now);
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
      this.renderer.setPlacementPreview(null);
      return;
    }

    const pointer = this.pointerAimTarget;
    if (!pointer) {
      this.renderer.setPlacementPreview(null);
      return;
    }

    const itemContent = getItemContent(selectedSlot.typeId);
    const buildsEntityTypeId = itemContent?.buildsEntityTypeId;
    if (!buildsEntityTypeId) {
      this.renderer.setPlacementPreview(null);
      return;
    }

    const buildEntityContent = getEntityContent(buildsEntityTypeId);
    const hitboxProfiles = buildEntityContent?.hitboxProfiles;
    if (!hitboxProfiles) {
      this.renderer.setPlacementPreview(null);
      return;
    }

    const activeProfileName = buildEntityContent?.activeHitboxProfile;
    const previewProfile =
      (activeProfileName && hitboxProfiles[activeProfileName]) ??
      Object.values(hitboxProfiles)[0];
    if (!previewProfile) {
      this.renderer.setPlacementPreview(null);
      return;
    }

    const previewRects = resolveHitboxRects(
      pointer.x,
      pointer.y,
      previewProfile,
    );
    const previewBounds = offsetHitboxBounds(
      getHitboxBounds(previewProfile),
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
      for (const entity of world.entities.values()) {
        if (!entity.alive || entity.id === player.id) {
          continue;
        }
        if (entity.kind === "projectile" || entity.kind === "pickup") {
          continue;
        }
        const entityContent = getEntityContent(entity.typeId);
        if (entityContent?.collisionMode === "none") {
          continue;
        }

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

    this.renderer.setPlacementPreview({
      visible: true,
      worldX: pointer.x,
      worldY: pointer.y,
      valid,
      typeId: buildsEntityTypeId,
      hitboxProfiles,
      activeHitboxProfile: activeProfileName,
    });
  }
}

declare global {
  interface Window {
    gameClient: GameClient;
  }
}
