/**
 * Shared runtime configuration used by both server and client.
 * Keeps cadence, world, networking, and protocol settings together.
 */
export class GameConfig {
  public static readonly DEFAULT_TICK_RATE = 20;
  public static readonly DEFAULT_PROTOCOL_VERSION = 1;
  public static readonly DEFAULT_SPATIAL_CELL_SIZE = 64;

  public tickRate = GameConfig.DEFAULT_TICK_RATE;
  public worldSize = {
    w: 3000,
    h: 3000,
  };
  public collision = {
    spatialCellSize: GameConfig.DEFAULT_SPATIAL_CELL_SIZE,
  };
  public network = {
    maxPlayers: 64,
    maxPacketBytes: 16 * 1024,
  };
  public replication = {
    interestRadius: 960,
  };
  public debug = {
    spawnMultiplier: 1,
    focusedTrace: {
      entityId: null as number | null,
      playerName: "",
    },
  };
  public interpolation = {
    snapDistance: 192,
    historySize: 5,
  };
  public dayNight = {
    dayDurationMs: 120000,
    nightDurationMs: 60000,
  };
  public protocolVersion = GameConfig.DEFAULT_PROTOCOL_VERSION;

  /**
   * Creates a config instance and applies environment overrides for the core numeric settings.
   * @returns Loaded runtime configuration.
   */
  public static load(): GameConfig {
    const gameConfig = new GameConfig();
    const tickRate = Number(process.env.TICK_RATE ?? gameConfig.tickRate);
    const spatialCellSize = Number(
      process.env.SPATIAL_CELL_SIZE ?? gameConfig.collision.spatialCellSize,
    );
    const interestRadius = Number(
      process.env.INTEREST_RADIUS ?? gameConfig.replication.interestRadius,
    );
    const interpolationHistorySize = Number(
      process.env.INTERPOLATION_HISTORY_SIZE ??
        gameConfig.interpolation.historySize,
    );
    const debugSpawnMultiplier = Number(
      process.env.DEBUG_SPAWN_MULTIPLIER ?? gameConfig.debug.spawnMultiplier,
    );
    const debugFocusedEntityIdRaw = process.env.DEBUG_FOCUSED_ENTITY_ID;
    const debugFocusedPlayerName =
      process.env.DEBUG_FOCUSED_PLAYER_NAME ??
      gameConfig.debug.focusedTrace.playerName;

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
      Number.isFinite(interpolationHistorySize) &&
      Number.isInteger(interpolationHistorySize) &&
      interpolationHistorySize >= 2
    ) {
      gameConfig.interpolation.historySize = interpolationHistorySize;
    }
    if (
      Number.isFinite(debugSpawnMultiplier) &&
      Number.isInteger(debugSpawnMultiplier) &&
      debugSpawnMultiplier >= 0
    ) {
      gameConfig.debug.spawnMultiplier = debugSpawnMultiplier;
    }
    if (debugFocusedEntityIdRaw !== undefined) {
      const debugFocusedEntityId = Number(debugFocusedEntityIdRaw);
      if (
        Number.isFinite(debugFocusedEntityId) &&
        Number.isInteger(debugFocusedEntityId) &&
        debugFocusedEntityId >= 0
      ) {
        gameConfig.debug.focusedTrace.entityId = debugFocusedEntityId;
      }
    }
    gameConfig.debug.focusedTrace.playerName = debugFocusedPlayerName.trim();

    return gameConfig;
  }
}
