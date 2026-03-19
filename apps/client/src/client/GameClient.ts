import { InputManager } from "@client/input/InputManager.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { WsClient } from "@client/net/WsClient.ts";
import { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type { RecipeId } from "@shared/content/types.ts";
import type { GameConfig } from "@shared/config/GameConfig.ts";
import { getResourceNamespace } from "@shared/ids/ResourceId.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

export type GameplayHudState = {
  activeWeaponLabel: string;
  ammoLabel: string | null;
  reloadTicksRemaining: number | null;
  activeSlot: number | null;
  slotLabels: string[];
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

  private inputTimer: ReturnType<typeof setInterval> | undefined;
  private animationFrameId: number | undefined;
  private lastAnimationFrameTime: number | undefined;
  private inputBound = false;
  private rendererPointerBound = false;
  private started = false;
  private readonly debugHitbox: boolean;
  private readonly debugInterpolationMode: number;
  private pointerActionHandler?: (worldPoint: { x: number; y: number }) => void;

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
      this.inputManager.queueAttack(worldPoint.x, worldPoint.y);
    }
    event.preventDefault();
  };

  public constructor(
    gameConfig: GameConfig,
    options: { debugHitbox?: boolean; debugInterpolationMode?: number } = {},
  ) {
    this.gameConfig = gameConfig;
    this.networkClient = new WsClient();
    this.inputManager = new InputManager();
    this.renderer = new PixiRenderer(this.gameConfig.worldSize);
    this.interpolator = new Interpolator(this.gameConfig.interpolation);
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

  public async initRenderer(hostElement: HTMLElement): Promise<void> {
    await this.renderer.init(hostElement, this.gameConfig.worldSize);

    if (!this.rendererPointerBound) {
      this.renderer
        .getView()
        ?.addEventListener("pointerdown", this.handlePointerDown);
      this.rendererPointerBound = true;
    }
  }

  public setWorldSize(worldSize: GameConfig["worldSize"]): void {
    this.gameConfig.worldSize = { ...worldSize };
    this.renderer.setWorldSize(this.gameConfig.worldSize);
  }

  public setPointerActionHandler(
    handler: ((worldPoint: { x: number; y: number }) => void) | undefined,
  ): void {
    this.pointerActionHandler = handler;
  }

  public queueAttack(x: number, y: number): void {
    this.inputManager.queueAttack(x, y);
  }

  public queueCraftRecipe(recipeId: RecipeId): void {
    this.inputManager.queueCraft(recipeId);
  }

  public queueBuildPlacement(
    itemTypeId: ResourceId,
    x: number,
    y: number,
  ): void {
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

    const periodMs = Math.floor(1000 / this.gameConfig.tickRate);
    this.inputTimer = setInterval(() => {
      const latestTick = this.worldState?.latestTick ?? 0;
      this.networkClient.sendInput(this.inputManager.toCommand(latestTick));
      this.inputManager.clearOneShots();
    }, periodMs);
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
  }

  public onWelcome(entityId: number): void {
    this.playerEntityId = entityId;
    this.renderer.setPlayerEntityId(entityId);
  }

  public stop(): void {
    this.started = false;
    this.stopFrameLoop();
    if (this.inputTimer) {
      clearInterval(this.inputTimer);
      this.inputTimer = undefined;
    }
    this.networkClient.disconnect();
    this.worldState?.clear();
    this.playerEntityId = undefined;
    this.renderer.setPlayerEntityId(undefined);
  }

  public renderGameToText(): string {
    const entities = [
      ...(this.worldState?.clientWorld?.entities.values() ?? []),
    ];
    const player = entities.find((entity) => entity.id === this.playerEntityId);
    const hudState = this.getGameplayHudState();

    return JSON.stringify({
      connected:
        this.networkClient.socket?.readyState === WebSocket.OPEN &&
        this.started,
      coordinateSystem: "origin top-left; +x right; +y down",
      tick: this.worldState?.latestTick ?? null,
      playerEntityId: this.playerEntityId ?? null,
      player: player
        ? {
            id: player.id,
            x: Math.round(player.x),
            y: Math.round(player.y),
            hp: player.hp,
            maxHp: player.maxHp,
          }
        : null,
      activeWeapon: hudState?.activeWeaponLabel ?? null,
      ammo: hudState?.ammoLabel ?? null,
      reloadTicksRemaining: hudState?.reloadTicksRemaining ?? null,
      enemies: entities
        .filter((entity) => getResourceNamespace(entity.typeId) === "enemy")
        .map((entity) => ({
          id: entity.id,
          x: Math.round(entity.x),
          y: Math.round(entity.y),
          hp: entity.hp,
          maxHp: entity.maxHp,
        })),
      projectiles: entities
        .filter(
          (entity) => getResourceNamespace(entity.typeId) === "projectile",
        )
        .map((entity) => ({
          id: entity.id,
          x: Math.round(entity.x),
          y: Math.round(entity.y),
        })),
      events: this.worldState?.clientWorld?.events ?? [],
    });
  }

  public getGameplayHudState(): GameplayHudState | null {
    const player = this.getLocalPlayerEntity();
    if (!player) {
      return null;
    }

    const activeSlot =
      typeof player.activeSlot === "number" ? player.activeSlot : null;
    const activeItem =
      activeSlot !== null ? (player.inventory?.[activeSlot] ?? null) : null;
    const ammoInMag =
      typeof activeItem?.ammoInMag === "number" ? activeItem.ammoInMag : null;
    const magSize =
      typeof activeItem?.magSize === "number" ? activeItem.magSize : null;
    const reloadTicksRemaining =
      typeof activeItem?.reloadTicksRemaining === "number"
        ? activeItem.reloadTicksRemaining
        : null;

    return {
      activeWeaponLabel: activeItem
        ? this.formatResourceLabel(activeItem.typeId)
        : "Unarmed",
      ammoLabel:
        ammoInMag !== null && magSize !== null
          ? `${ammoInMag}/${magSize}`
          : null,
      reloadTicksRemaining:
        reloadTicksRemaining !== null && reloadTicksRemaining > 0
          ? reloadTicksRemaining
          : null,
      activeSlot,
      slotLabels: Array.from(
        { length: player.inventory?.length ?? 0 },
        (_, slotIndex) => {
          const item = player.inventory?.[slotIndex] ?? null;
          const label = item ? this.formatResourceLabel(item.typeId) : "Empty";
          const prefix = activeSlot === slotIndex ? ">" : "";
          return `${prefix}${slotIndex + 1} ${label}`;
        },
      ),
    };
  }

  public advanceTime(ms: number): void {
    const frameMs = 1000 / 60;
    const steps = Math.max(1, Math.round(ms / frameMs));
    for (let index = 0; index < steps; index += 1) {
      this.update(frameMs, performance.now() + index * frameMs);
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
    this.stopFrameLoop();
    if (this.inputTimer) {
      clearInterval(this.inputTimer);
      this.inputTimer = undefined;
    }
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

  private formatResourceLabel(typeId: string): string {
    const [, path = typeId] = typeId.split(":");
    const baseLabel = path.split("/").pop() ?? path;
    return baseLabel
      .split(/[_-]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
}

declare global {
  interface Window {
    gameClient: GameClient;
  }
}
