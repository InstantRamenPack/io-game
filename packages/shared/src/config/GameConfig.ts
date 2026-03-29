/**
 * Shared runtime configuration used by both server and client.
 * Keeps cadence, world, networking, and protocol settings together.
 */
export class GameConfig {
  static readonly DEFAULT_TICK_RATE = 20;
  static readonly DEFAULT_PROTOCOL_VERSION = 1;
  static readonly DEFAULT_SPATIAL_CELL_SIZE = 64;

  tickRate = GameConfig.DEFAULT_TICK_RATE;
  worldSize = {
    w: 3000,
    h: 3000,
  };
  collision = {
    spatialCellSize: GameConfig.DEFAULT_SPATIAL_CELL_SIZE,
  };
  network = {
    maxPlayers: 64,
    maxPacketBytes: 16 * 1024,
  };
  interpolation = {
    snapDistance: 192,
  };
  dayNight = {
    dayDurationMs: 120000,
    nightDurationMs: 60000,
  };
  protocolVersion = GameConfig.DEFAULT_PROTOCOL_VERSION;

  /**
   * Creates a config instance and applies environment overrides for the core numeric settings.
   * @returns Loaded runtime configuration.
   */
  static load(): GameConfig {
    const gameConfig = new GameConfig();
    const tickRate = Number(process.env.TICK_RATE ?? gameConfig.tickRate);
    const spatialCellSize = Number(
      process.env.SPATIAL_CELL_SIZE ?? gameConfig.collision.spatialCellSize,
    );

    if (Number.isFinite(tickRate) && tickRate > 0) {
      gameConfig.tickRate = Math.floor(tickRate);
    }
    if (Number.isFinite(spatialCellSize) && spatialCellSize > 0) {
      gameConfig.collision.spatialCellSize = Math.floor(spatialCellSize);
    }

    return gameConfig;
  }
}
