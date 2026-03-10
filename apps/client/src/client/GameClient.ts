import { GameConfig } from "@shared/config/GameConfig.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import { InputManager } from "@client/input/InputManager.ts";
import { WsClient } from "@client/net/WsClient.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import { PixiRenderer } from "@client/render/PixiRenderer.ts";

/**
 * Coordinates client networking, snapshot state, interpolation, and rendering.
 * This stays presentation-only and does not own authoritative gameplay rules.
 */
export class GameClient {
  networkClient: WsClient;
  worldState: ClientWorldState;
  interpolator: Interpolator;
  inputManager: InputManager;
  renderer: PixiRenderer;
  gameConfig: GameConfig;

  private inputTimer: ReturnType<typeof setInterval> | undefined;
  private started = false;

  /**
   * Creates a client runtime with network, state, and renderer dependencies.
   * @param gameConfig Shared runtime configuration used by the client.
   */
  constructor(gameConfig: GameConfig) {
    this.gameConfig = gameConfig;
    this.networkClient = new WsClient();
    this.worldState = new ClientWorldState(
      gameConfig.clientSnapshotHistoryCapacity,
    );
    this.interpolator = new Interpolator(gameConfig.interpolation.bufferTicks);
    this.inputManager = new InputManager();
    this.renderer = new PixiRenderer();
    this.networkClient.onSnapshot((snapshot) => this.onSnapshot(snapshot));
  }

  /**
   * Connects to the game server and starts periodic input sends.
   * @param url WebSocket endpoint for the authoritative server.
   * @param googleIdToken Optional Google ID token sent during the hello handshake.
   */
  start(url: string, googleIdToken?: string): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.networkClient.connect(url, googleIdToken);

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
      return;
    }

    const renderTick =
      latestSnapshot.tick - this.gameConfig.interpolation.bufferTicks;
    const interpolatedEntities = this.interpolator.sample(
      this.worldState.getHistory(),
      renderTick,
    );
    this.renderer.sync(interpolatedEntities);
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
    if (this.inputTimer) {
      clearInterval(this.inputTimer);
      this.inputTimer = undefined;
    }
    this.networkClient.disconnect();
  }
}
