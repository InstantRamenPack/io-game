import { GameConfig } from "@shared/config/GameConfig.ts";
import { getResourceNamespace } from "@shared/ids/ResourceId.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import { InputManager } from "@client/input/InputManager.ts";
import { WsClient } from "@client/net/WsClient.ts";
import { ClientEntity } from "@client/net/ClientEntity.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { PixiRenderer } from "@client/render/PixiRenderer.ts";
import { Interpolator } from "@client/net/Interpolator.ts";

export type GameplayHudState = {
  activeWeaponLabel: string;
  ammoLabel: string | null;
  reloadTicksRemaining: number | null;
  activeSlot: number | null;
  slotLabels: string[];
};

/**
 * Coordinates client networking, snapshot state, interpolation, and rendering.
 * This stays presentation-only and does not own authoritative gameplay rules.
 */
export class GameClient {
  networkClient: WsClient;
  worldState?: ClientWorldState;
  inputManager: InputManager;
  renderer: PixiRenderer;
  gameConfig: GameConfig;
  playerEntityId?: number;
  interpolator: Interpolator;

  private inputTimer: ReturnType<typeof setInterval> | undefined;
  private animationFrameId: number | undefined;
  private lastAnimationFrameTime: number | undefined;
  private inputBound = false;
  private rendererPointerBound = false;
  private started = false;
  private readonly debugHitbox: boolean;
  private readonly debugInterpolationMode: number;
  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.started || event.button !== 0 || !event.isPrimary) {
      return;
    }

    const worldPoint = this.renderer.screenToWorld(
      event.clientX,
      event.clientY,
    );
    this.inputManager.queueAttack(worldPoint.x, worldPoint.y);
    event.preventDefault();
  };

  /**
   * Creates a client runtime with network, state, and renderer dependencies.
   * @param gameConfig Shared runtime configuration used by the client.
   * @param options Local debug overlay flags applied to client-side render state.
   */
  constructor(
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

    window.gameClient = this; // Expose game client for debugging
  }

  /**
   * Binds the input manager to the given browser event target once.
   * @param targetElement Window or element that should receive movement input.
   */
  bindInput(targetElement: HTMLElement | Window): void {
    if (this.inputBound) {
      return;
    }
    this.inputManager.bind(targetElement);
    this.inputBound = true;
  }

  /**
   * Attaches the Pixi renderer to a host element.
   * @param hostElement DOM node that should contain the game canvas.
   */
  async initRenderer(hostElement: HTMLElement): Promise<void> {
    await this.renderer.init(hostElement, this.gameConfig.worldSize);

    if (!this.rendererPointerBound) {
      this.renderer
        .getView()
        ?.addEventListener("pointerdown", this.handlePointerDown);
      this.rendererPointerBound = true;
    }
  }

  /**
   * Updates the renderer projection to the current authoritative world size.
   * @param worldSize Runtime world bounds.
   */
  setWorldSize(worldSize: GameConfig["worldSize"]): void {
    this.gameConfig.worldSize = { ...worldSize };
    this.renderer.setWorldSize(this.gameConfig.worldSize);
  }

  /**
   * Connects to the game server and starts periodic input sends/render updates.
   * @param url WebSocket endpoint for the authoritative server.
   * @param connectOptions Hello-handshake data such as auth token and player name.
   */
  start(
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

  /**
   * Advances client simulation and render state for one frame.
   * @param deltaMs Frame delta in milliseconds.
   * @param frameTimeMs Monotonic timestamp for the current frame.
   */
  update(deltaMs: number, frameTimeMs = performance.now()): void {
    if (this.worldState) {
      this.interpolator.updateInterpolation(this.worldState, frameTimeMs);
      this.worldState.clientWorld?.update(deltaMs);
    }
    this.renderer.update(deltaMs);
  }

  /**
   * Stores an authoritative world snapshot received from the server.
   * @param snapshot Snapshot payload from the authoritative server.
   */
  onSnapshot(snapshot: WorldSnapshot): void {
    this.worldState?.pushSnapshot(snapshot);
  }

  /**
   * Stores the authoritative player entity id assigned by the server.
   */
  onWelcome(entityId: number): void {
    this.playerEntityId = entityId;
    this.renderer.setPlayerEntityId(entityId);
  }

  /**
   * Stops periodic input sends and releases client-side timer resources.
   */
  stop(): void {
    this.started = false;
    this.stopFrameLoop();
    if (this.inputTimer) {
      clearInterval(this.inputTimer);
      this.inputTimer = undefined;
    }
    this.networkClient.disconnect();
    this.worldState?.clear(); //clears rendered entities too
    this.playerEntityId = undefined;
    this.renderer.setPlayerEntityId(undefined);
  }

  /**
   * Starts the requestAnimationFrame loop used for client-side interpolation.
   */
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

  /**
   * Stops the requestAnimationFrame loop.
   */
  private stopFrameLoop(): void {
    if (this.animationFrameId !== undefined) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
    this.lastAnimationFrameTime = undefined;
  }

  /**
   * Handles socket closure by resetting interpolation state and frame timers.
   */
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

  /**
   * Returns a concise JSON string describing the current interactive game state.
   * @returns Text-rendered snapshot of client state for automated checks.
   */
  renderGameToText(): string {
    const entities = [
      ...(this.worldState?.clientWorld?.entities.values() ?? []),
    ];
    const player = entities.find((entity) => entity.id === this.playerEntityId);
    const projectiles = entities
      .filter((entity) => getResourceNamespace(entity.typeId) === "projectile")
      .map((entity) => ({
        id: entity.id,
        x: Math.round(entity.x),
        y: Math.round(entity.y),
      }));
    const enemies = entities
      .filter((entity) => getResourceNamespace(entity.typeId) === "enemy")
      .map((entity) => ({
        id: entity.id,
        x: Math.round(entity.x),
        y: Math.round(entity.y),
        hp: entity.hp,
        maxHp: entity.maxHp,
      }));
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
      enemies,
      projectiles,
      events: this.worldState?.clientWorld?.events ?? [],
    });
  }

  getGameplayHudState(): GameplayHudState | null {
    const player = this.getLocalPlayerEntity();
    if (!player) {
      return null;
    }

    const activeSlot =
      typeof player.activeSlot === "number" ? player.activeSlot : null;
    const activeItem =
      activeSlot !== null ? (player.inventory?.[activeSlot] ?? null) : null;
    const ammoInMag = this.readItemNumber(activeItem?.data, "ammoInMag");
    const magSize = this.readItemNumber(activeItem?.data, "magSize");
    const reloadTicksRemaining = this.readItemNumber(
      activeItem?.data,
      "reloadTicksRemaining",
    );

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
      slotLabels: [0, 1].map((slotIndex) => {
        const item = player.inventory?.[slotIndex] ?? null;
        const label = item ? this.formatResourceLabel(item.typeId) : "Empty";
        const prefix = activeSlot === slotIndex ? ">" : "";
        return `${prefix}${slotIndex + 1} ${label}`;
      }),
    };
  }

  /**
   * Advances client interpolation and presentation state without waiting for rAF.
   * @param ms Amount of simulated frame time to advance.
   */
  advanceTime(ms: number): void {
    const frameMs = 1000 / 60;
    const steps = Math.max(1, Math.round(ms / frameMs));
    for (let index = 0; index < steps; index += 1) {
      this.update(frameMs, performance.now() + index * frameMs);
    }
  }

  private getLocalPlayerEntity(): ClientEntity | undefined {
    if (this.playerEntityId === undefined) {
      return undefined;
    }

    return this.worldState?.clientWorld?.entities.get(this.playerEntityId);
  }

  private readItemNumber(
    data: Record<string, unknown> | undefined,
    key: string,
  ): number | null {
    const value = data?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
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
