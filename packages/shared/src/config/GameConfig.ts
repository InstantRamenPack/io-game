/**
 * Shared runtime configuration used by both server and client.
 * Keeps cadence, world, networking, and interpolation settings together.
 */
export class GameConfig {
  static readonly DEFAULT_TICK_RATE = 20;
  static readonly DEFAULT_SNAPSHOT_RATE = 10;
  static readonly DEFAULT_PROTOCOL_VERSION = 1;
  static readonly DEFAULT_CLIENT_SNAPSHOT_HISTORY_CAPACITY = 120;

  tickRate = GameConfig.DEFAULT_TICK_RATE;
  snapshotRate = GameConfig.DEFAULT_SNAPSHOT_RATE;
  worldSize = { w: 2000, h: 2000 };
  network = { maxPlayers: 64, maxPacketBytes: 16 * 1024 };
  interpolation = { bufferTicks: 2 };
  clientSnapshotHistoryCapacity =
    GameConfig.DEFAULT_CLIENT_SNAPSHOT_HISTORY_CAPACITY;
  protocolVersion = GameConfig.DEFAULT_PROTOCOL_VERSION;

  /**
   * Creates a config instance and applies environment overrides for the core numeric settings.
   * @returns Loaded runtime configuration.
   */
  static load(): GameConfig {
    const gameConfig = new GameConfig();
    const tickRate = Number(process.env.TICK_RATE ?? gameConfig.tickRate);
    const snapshotRate = Number(
      process.env.SNAPSHOT_RATE ?? gameConfig.snapshotRate,
    );
    const clientSnapshotHistoryCapacity = Number(
      process.env.CLIENT_SNAPSHOT_HISTORY_CAPACITY ??
        gameConfig.clientSnapshotHistoryCapacity,
    );

    if (Number.isFinite(tickRate) && tickRate > 0) {
      gameConfig.tickRate = Math.floor(tickRate);
    }
    if (Number.isFinite(snapshotRate) && snapshotRate > 0) {
      gameConfig.snapshotRate = Math.floor(snapshotRate);
    }
    if (
      Number.isFinite(clientSnapshotHistoryCapacity) &&
      clientSnapshotHistoryCapacity > 0
    ) {
      gameConfig.clientSnapshotHistoryCapacity = Math.floor(
        clientSnapshotHistoryCapacity,
      );
    }

    return gameConfig;
  }
}
