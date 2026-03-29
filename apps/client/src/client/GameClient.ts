import { InputManager } from "@client/input/InputManager.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { WsClient } from "@client/net/WsClient.ts";
import { PixiRenderer } from "@client/render/PixiRenderer.ts";
import { getResourceDisplayLabel } from "@shared/content/catalog.ts";
import type { GameConfig } from "@shared/config/GameConfig.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

export type GameplayHudState = {
  activeWeaponLabel: string;
  ammoLabel: string | null;
  reloadTicksRemaining: number | null;
  activeWeaponIndex: number | null;
  slotLabels: string[];
};

export type PerformanceRateState = {
  frameRate: number | null;
  tickRate: number | null;
};

const RATE_SAMPLE_WINDOW_MS = 1000;
const MIN_RATE_SAMPLE_WINDOW_MS = 250;

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

  private inputTimer: ReturnType<typeof setInterval> | undefined;
  private animationFrameId: number | undefined;
  private lastAnimationFrameTime: number | undefined;
  private inputBound = false;
  private rendererPointerBound = false;
  private started = false;
  private sessionReady = false;
  private frameSamples: number[] = [];
  private tickSamples: Array<{ tick: number; timeMs: number }> = [];
  private readonly debugHitbox: boolean;
  private readonly debugInterpolationMode: number;
  private pointerActionHandler?: (worldPoint: { x: number; y: number }) => void;
  private sessionReadyHandlers: Array<() => void> = [];
  private worldUpdatedHandlers: Array<() => void> = [];

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.started || event.button !== 0 || !event.isPrimary) {
      return;
    }

    const worldPoint = this.renderer.screenToWorld(
      event.clientX,
      event.clientY,
    );
    if (this.pointerActionHandler) {
      this.pointerActionHandler(worldPoint);
    } else {
      this.inputManager.startHoldFire(worldPoint.x, worldPoint.y);
    }
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.started || !event.isPrimary) {
      return;
    }
    const worldPoint = this.renderer.screenToWorld(
      event.clientX,
      event.clientY,
    );
    this.inputManager.updateHoldFireTarget(worldPoint.x, worldPoint.y);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }
    this.inputManager.stopHoldFire();
  };

  public constructor(
    gameConfig: GameConfig,
    options: { debugHitbox?: boolean; debugInterpolationMode?: number } = {},
  ) {
    this.gameConfig = gameConfig;
    this.networkClient = new WsClient();
    this.inputManager = new InputManager();
    this.renderer = new PixiRenderer(this.gameConfig.worldSize);
    this.interpolator = new Interpolator({
      snapDistance: this.gameConfig.interpolation.snapDistance,
      expectedSnapshotMs: 1000 / this.gameConfig.tickRate,
    });
    this.debugHitbox = options.debugHitbox ?? false;
    this.debugInterpolationMode = options.debugInterpolationMode ?? 0;

    this.networkClient.onSnapshot((snapshot) => this.onSnapshot(snapshot));
    this.networkClient.onWelcome((entityId) => this.onWelcome(entityId));
    this.networkClient.onClose(() => this.onDisconnected());

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
    this.interpolator.setExpectedSnapshotMs(1000 / this.gameConfig.tickRate);
  }

  public setPointerActionHandler(
    handler: ((worldPoint: { x: number; y: number }) => void) | undefined,
  ): void {
    this.pointerActionHandler = handler;
  }

  public startHoldFire(x: number, y: number): void {
    this.inputManager.startHoldFire(x, y);
  }

  public queueAttack(x: number, y: number): void {
    this.inputManager.queueAttack(x, y);
  }

  public queueCraftItem(itemTypeId: ResourceId): void {
    this.inputManager.queueCraft(itemTypeId);
  }

  public queueBuildPlacement(itemTypeId: ResourceId, x: number, y: number): void {
    this.inputManager.queueBuild(itemTypeId, x, y);
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
    this.resetPerformanceRateSamples();
    this.worldState = new ClientWorldState(
      this.renderer,
      this.debugHitbox,
      this.debugInterpolationMode,
    );
    this.startFrameLoop();

    this.networkClient.connect(url, {
      googleIdToken: connectOptions.googleIdToken,
      playerName: connectOptions.playerName,
      protocolVersion: this.gameConfig.protocolVersion,
    });
  }

  public update(deltaMs: number, frameTimeMs = performance.now()): void {
    if (this.worldState) {
      this.interpolator.updateInterpolation(this.worldState, frameTimeMs);
      this.worldState.clientWorld?.update(deltaMs);
    }
    this.renderer.update(deltaMs);
  }

  public onSnapshot(snapshot: WorldSnapshot): void {
    this.worldState?.pushSnapshot(snapshot);
    this.recordTickSample(snapshot.tick, performance.now());
    for (const worldUpdatedHandler of this.worldUpdatedHandlers) {
      worldUpdatedHandler();
    }
  }

  public onWelcome(entityId: number): void {
    this.playerEntityId = entityId;
    this.sessionReady = true;
    this.renderer.setPlayerEntityId(entityId);
    this.startInputLoop();
    for (const sessionReadyHandler of this.sessionReadyHandlers) {
      sessionReadyHandler();
    }
  }

  public stop(): void {
    this.started = false;
    this.sessionReady = false;
    this.stopFrameLoop();
    this.stopInputLoop();
    this.resetPerformanceRateSamples();
    this.networkClient.disconnect();
    this.worldState?.clear();
    this.playerEntityId = undefined;
    this.renderer.setPlayerEntityId(undefined);
  }

  public getGameplayHudState(): GameplayHudState | null {
    const player = this.getLocalPlayerEntity();
    const inventory = player?.inventory;
    if (!player || !inventory) {
      return null;
    }

    const activeWeaponIndex = inventory.activeWeaponIndex;
    const activeWeapon =
      activeWeaponIndex !== null
        ? (inventory.weapons[activeWeaponIndex] ?? null)
        : null;
    const ammoInMag =
      typeof activeWeapon?.ammoInMag === "number" ? activeWeapon.ammoInMag : null;
    const magSize =
      typeof activeWeapon?.magSize === "number" ? activeWeapon.magSize : null;
    const reloadTicksRemaining =
      typeof activeWeapon?.reloadTicksRemaining === "number"
        ? activeWeapon.reloadTicksRemaining
        : null;

    return {
      activeWeaponLabel: activeWeapon
        ? getResourceDisplayLabel(activeWeapon.typeId)
        : "Unarmed",
      ammoLabel:
        ammoInMag !== null && magSize !== null
          ? `${ammoInMag}/${magSize}`
          : null,
      reloadTicksRemaining:
        reloadTicksRemaining !== null && reloadTicksRemaining > 0
          ? reloadTicksRemaining
          : null,
      activeWeaponIndex,
      slotLabels: inventory.weapons.map((weapon, weaponIndex) => {
        const prefix = activeWeaponIndex === weaponIndex ? ">" : "";
        return `${prefix}${weaponIndex + 1} ${getResourceDisplayLabel(weapon.typeId)}`;
      }),
    };
  }

  public getMeasuredRates(): PerformanceRateState {
    const now = performance.now();
    this.trimFrameSamples(now);
    this.trimTickSamples(now);

    return {
      frameRate: this.calculateFrameRate(now),
      tickRate: this.calculateTickRate(now),
    };
  }

  public advanceTime(ms: number): void {
    const frameMs = 1000 / 60;
    const steps = Math.max(1, Math.round(ms / frameMs));
    for (let index = 0; index < steps; index += 1) {
      this.update(frameMs, performance.now() + index * frameMs);
    }
  }

  private startInputLoop(): void {
    if (this.inputTimer) {
      return;
    }

    const periodMs = Math.max(1, Math.floor(1000 / this.gameConfig.tickRate));
    this.inputTimer = setInterval(() => {
      const latestTick = this.worldState?.latestTick ?? 0;
      this.networkClient.sendInput(this.inputManager.toCommand(latestTick));
      this.inputManager.clearOneShots();
    }, periodMs);
  }

  private stopInputLoop(): void {
    if (this.inputTimer) {
      clearInterval(this.inputTimer);
      this.inputTimer = undefined;
    }
  }

  private startFrameLoop(): void {
    if (this.animationFrameId !== undefined) {
      return;
    }

    const tick = (timestamp: number): void => {
      if (!this.started) {
        this.animationFrameId = undefined;
        return;
      }

      const deltaMs =
        this.lastAnimationFrameTime === undefined
          ? 0
          : timestamp - this.lastAnimationFrameTime;
      this.lastAnimationFrameTime = timestamp;
      this.recordFrameSample(timestamp);
      this.update(deltaMs, timestamp);
      this.animationFrameId = window.requestAnimationFrame(tick);
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

  private onDisconnected(): void {
    this.started = false;
    this.sessionReady = false;
    this.stopFrameLoop();
    this.stopInputLoop();
    this.resetPerformanceRateSamples();
    this.worldState?.clear();
    this.playerEntityId = undefined;
    this.renderer.setPlayerEntityId(undefined);
  }

  private getLocalPlayerEntity(): ClientEntity | undefined {
    if (this.playerEntityId === undefined) {
      return undefined;
    }

    return this.worldState?.clientWorld?.entities.get(this.playerEntityId);
  }

  private recordFrameSample(timestamp: number): void {
    this.frameSamples.push(timestamp);
    this.trimFrameSamples(timestamp);
  }

  private recordTickSample(tick: number, timeMs: number): void {
    this.tickSamples.push({ tick, timeMs });
    this.trimTickSamples(timeMs);
  }

  private trimFrameSamples(now: number): void {
    while (
      this.frameSamples.length > 1 &&
      now - (this.frameSamples[0] ?? now) > RATE_SAMPLE_WINDOW_MS
    ) {
      this.frameSamples.shift();
    }
  }

  private trimTickSamples(now: number): void {
    while (
      this.tickSamples.length > 1 &&
      now - (this.tickSamples[0]?.timeMs ?? now) > RATE_SAMPLE_WINDOW_MS
    ) {
      this.tickSamples.shift();
    }
  }

  private calculateFrameRate(now: number): number | null {
    if (this.frameSamples.length >= 2) {
      const firstSample = this.frameSamples[0] ?? now;
      const lastSample = this.frameSamples[this.frameSamples.length - 1] ?? now;
      const elapsedMs = lastSample - firstSample;
      if (elapsedMs <= 0) {
        return null;
      }

      return ((this.frameSamples.length - 1) * 1000) / elapsedMs;
    }

    if (this.frameSamples.length === 1) {
      return now - (this.frameSamples[0] ?? now) >= MIN_RATE_SAMPLE_WINDOW_MS
        ? 0
        : null;
    }

    return null;
  }

  private calculateTickRate(now: number): number | null {
    if (this.tickSamples.length >= 2) {
      const firstSample = this.tickSamples[0];
      const lastSample = this.tickSamples[this.tickSamples.length - 1];
      if (!firstSample || !lastSample) {
        return null;
      }

      const elapsedMs = lastSample.timeMs - firstSample.timeMs;
      if (elapsedMs <= 0) {
        return null;
      }

      return ((lastSample.tick - firstSample.tick) * 1000) / elapsedMs;
    }

    if (this.tickSamples.length === 1) {
      return now - (this.tickSamples[0]?.timeMs ?? now) >=
        MIN_RATE_SAMPLE_WINDOW_MS
        ? 0
        : null;
    }

    return null;
  }

  private resetPerformanceRateSamples(): void {
    this.frameSamples = [];
    this.tickSamples = [];
  }
}

declare global {
  interface Window {
    gameClient: GameClient;
  }
}
