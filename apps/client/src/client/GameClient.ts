import { GameConfig } from "@shared/config/GameConfig.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import { InputManager } from "@client/input/InputManager.ts";
import { WsClient } from "@client/net/WsClient.ts";
import { ClientWorldState } from "@client/net/ClientWorldState.ts";
import { Interpolator } from "@client/net/Interpolator.ts";
import { PixiRenderer } from "@client/render/PixiRenderer.ts";

/** Coordinates networking, client state, interpolation, and rendering. */
export class GameClient {
  networkClient: WsClient;
  worldState: ClientWorldState;
  interpolator: Interpolator;
  inputManager: InputManager;
  renderer: PixiRenderer;
  gameConfig: GameConfig;

  private inputTimer: ReturnType<typeof setInterval> | undefined;
  private started = false;

  /** Creates a client runtime with network, state, and renderer dependencies. */
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

  /** Connects to the game server and starts periodic input sends. */
  start(url: string): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.networkClient.connect(url);

    const periodMs = Math.floor(1000 / this.gameConfig.tickRate);
    this.inputTimer = setInterval(() => {
      const latestTick = this.worldState.latest?.tick ?? 0;
      this.networkClient.sendInput(this.inputManager.toCommand(latestTick));
      this.inputManager.clearOneShots();
    }, periodMs);
  }

  /** Advances client simulation/render state for one frame. */
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

  /** Stores an authoritative world snapshot from the server. */
  onSnapshot(snapshot: WorldSnapshot): void {
    this.worldState.pushSnapshot(snapshot);
  }

  /** Stops periodic input sends and releases timer resources. */
  stop(): void {
    this.started = false;
    if (this.inputTimer) {
      clearInterval(this.inputTimer);
      this.inputTimer = undefined;
    }
    this.networkClient.disconnect();
  }
}
