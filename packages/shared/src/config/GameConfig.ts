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
  replication = {
    interestRadius: 640,
  };
  debug = {
    spawnMultiplier: 1,
  };
  interpolation = {
    snapDistance: 192,
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
    const interestRadius = Number(
      process.env.INTEREST_RADIUS ?? gameConfig.replication.interestRadius,
    );
    const debugSpawnMultiplier = Number(
      process.env.DEBUG_SPAWN_MULTIPLIER ?? gameConfig.debug.spawnMultiplier,
    );

    if (Number.isFinite(tickRate) && tickRate > 0) {
      gameConfig.tickRate = Math.floor(tickRate);
    }
    if (Number.isFinite(spatialCellSize) && spatialCellSize > 0) {
      gameConfig.collision.spatialCellSize = Math.floor(spatialCellSize);
    }
    if (Number.isFinite(interestRadius) && interestRadius > 0) {
      gameConfig.replication.interestRadius = Math.floor(interestRadius);
    }
    if (
      Number.isFinite(debugSpawnMultiplier) &&
      Number.isInteger(debugSpawnMultiplier) &&
      debugSpawnMultiplier >= 0
    ) {
      gameConfig.debug.spawnMultiplier = debugSpawnMultiplier;
    }

    return gameConfig;
  }
}
