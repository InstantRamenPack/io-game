import { GameConfig } from "@shared/config/GameConfig.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import { InputManager } from "@client/input/InputManager.ts";
import { WsClient } from "@client/net/WsClient.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { PixiRenderer } from "@client/render/PixiRenderer.ts";

/**
 * Coordinates client networking, snapshot state, extrapolation, and rendering.
 * This stays presentation-only and does not own authoritative gameplay rules.
 */
export class GameClient {
  networkClient: WsClient;
  worldState: ClientWorldState;
  inputManager: InputManager;
  renderer: PixiRenderer;
  gameConfig: GameConfig;

  private inputTimer: ReturnType<typeof setInterval> | undefined;
  private animationFrameId: number | undefined;
  private lastAnimationFrameTime: number | undefined;
  private inputBound = false;
  private started = false;

  /**
   * Creates a client runtime with network, state, and renderer dependencies.
   * @param gameConfig Shared runtime configuration used by the client.
   */
  constructor(gameConfig: GameConfig) {
    this.gameConfig = gameConfig;
    this.networkClient = new WsClient();
    this.worldState = new ClientWorldState();
    this.inputManager = new InputManager();
    this.renderer = new PixiRenderer();
    this.networkClient.onSnapshot((snapshot) => this.onSnapshot(snapshot));
    this.networkClient.onClose(() => this.onDisconnected());
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
  async attachRenderer(hostElement: HTMLElement): Promise<void> {
    await this.renderer.attach(hostElement, this.gameConfig.worldSize);
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
   * @param googleIdToken Optional Google ID token sent during the hello handshake.
   */
  start(url: string, googleIdToken?: string): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.startFrameLoop();
    this.networkClient.connect(
      url,
      googleIdToken,
      this.gameConfig.protocolVersion,
    );

    const periodMs = Math.floor(1000 / this.gameConfig.tickRate);
    this.inputTimer = setInterval(() => {
      const latestTick = this.worldState.latest?.tick ?? 0;
      this.networkClient.sendInput(this.inputManager.toCommand(latestTick));
      this.inputManager.clearOneShots();
    }, periodMs);
  }

  /**
   * Advances client simulation and render state for one frame.
   * @param deltaMs Frame delta in milliseconds.
   */
  update(deltaMs: number): void {
    const latestSnapshot = this.worldState.getLatest();
    if (!latestSnapshot) {
      this.renderer.sync(new Map());
      this.renderer.update(deltaMs);
      return;
    }

    this.worldState.advance(deltaMs);
    this.renderer.sync(this.worldState.getEntities());
    this.renderer.update(deltaMs);
  }

  /**
   * Stores an authoritative world snapshot received from the server.
   * @param snapshot Snapshot payload from the authoritative server.
   */
  onSnapshot(snapshot: WorldSnapshot): void {
    this.worldState.pushSnapshot(snapshot);
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
    this.worldState.clear();
    this.renderer.clear();
  }

  /**
   * Starts the requestAnimationFrame loop used for extrapolated movement.
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
      this.update(deltaMs);
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
   * Handles socket closure by resetting extrapolated state and frame timers.
   */
  private onDisconnected(): void {
    this.started = false;
    this.stopFrameLoop();
    if (this.inputTimer) {
      clearInterval(this.inputTimer);
      this.inputTimer = undefined;
    }
    this.worldState.clear();
    this.renderer.clear();
  }
}
