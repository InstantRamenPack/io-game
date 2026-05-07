import { COMPAT_HASH } from "@shared/config/compat.ts";
import { PROCEDURAL_WORLD_SIZE } from "@shared/world/ProceduralWorld.ts";

/**
 * Shared runtime configuration used by both server and client.
 * Keeps cadence, world, networking, and protocol settings together.
 */
export class GameConfig {
  public static readonly DEFAULT_TICK_RATE = 20;
  public static readonly DEFAULT_SPATIAL_CELL_SIZE = 64;

  public tickRate = GameConfig.DEFAULT_TICK_RATE;
  public worldSize = {
    w: PROCEDURAL_WORLD_SIZE.w,
    h: PROCEDURAL_WORLD_SIZE.h,
  };
  public collision = {
    spatialCellSize: GameConfig.DEFAULT_SPATIAL_CELL_SIZE,
    dynamicSolverIterations: 2,
    dynamicPushScale: 0.5,
    maxDynamicCorrectionPerTick: 8,
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
    historySize: 8,
    tickDurationSmoothing: 0.2,
    renderDelaySmoothing: 0.15,
    minRenderDelayTicks: 2.0,
    maxRenderDelayTicks: 5.0,
    maxExtrapolationTicks: 0.5,
    tickDurationMinFactor: 0.7,
    tickDurationMaxFactor: 1.4,
    arrivalEwmaSmoothing: 0.12,
    jitterEwmaSmoothing: 0.12,
    jitterBufferMultiplier: 3,
    jitterBufferSafetyMs: 35,
    maxDebugLogEntries: 600,
    correctionFollowSharpness: 18,
    correctionEpsilon: 0.01,
    correctionFrameScaleMin: 0.5,
    correctionFrameScaleMax: 2.5,
  };
  public dayNight = {
    dayDurationMs: 120000,
    nightDurationMs: 60000,
  };
  public compatHash = COMPAT_HASH;

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
    const dynamicSolverIterations = Number(
      process.env.DYNAMIC_SOLVER_ITERATIONS ??
        gameConfig.collision.dynamicSolverIterations,
    );
    const dynamicPushScale = Number(
      process.env.DYNAMIC_PUSH_SCALE ?? gameConfig.collision.dynamicPushScale,
    );
    const maxDynamicCorrectionPerTick = Number(
      process.env.MAX_DYNAMIC_CORRECTION_PER_TICK ??
        gameConfig.collision.maxDynamicCorrectionPerTick,
    );
    const interestRadius = Number(
      process.env.INTEREST_RADIUS ?? gameConfig.replication.interestRadius,
    );
    const interpolationHistorySize = Number(
      process.env.INTERPOLATION_HISTORY_SIZE ??
        gameConfig.interpolation.historySize,
    );
    const interpolationSnapDistance = Number(
      process.env.INTERPOLATION_SNAP_DISTANCE ??
        gameConfig.interpolation.snapDistance,
    );
    const interpolationTickDurationSmoothing = Number(
      process.env.INTERPOLATION_TICK_DURATION_SMOOTHING ??
        gameConfig.interpolation.tickDurationSmoothing,
    );
    const interpolationRenderDelaySmoothing = Number(
      process.env.INTERPOLATION_RENDER_DELAY_SMOOTHING ??
        gameConfig.interpolation.renderDelaySmoothing,
    );
    const interpolationMinRenderDelayTicks = Number(
      process.env.INTERPOLATION_MIN_RENDER_DELAY_TICKS ??
        gameConfig.interpolation.minRenderDelayTicks,
    );
    const interpolationMaxRenderDelayTicks = Number(
      process.env.INTERPOLATION_MAX_RENDER_DELAY_TICKS ??
        gameConfig.interpolation.maxRenderDelayTicks,
    );
    const interpolationMaxExtrapolationTicks = Number(
      process.env.INTERPOLATION_MAX_EXTRAPOLATION_TICKS ??
        gameConfig.interpolation.maxExtrapolationTicks,
    );
    const interpolationTickDurationMinFactor = Number(
      process.env.INTERPOLATION_TICK_DURATION_MIN_FACTOR ??
        gameConfig.interpolation.tickDurationMinFactor,
    );
    const interpolationTickDurationMaxFactor = Number(
      process.env.INTERPOLATION_TICK_DURATION_MAX_FACTOR ??
        gameConfig.interpolation.tickDurationMaxFactor,
    );
    const interpolationArrivalEwmaSmoothing = Number(
      process.env.INTERPOLATION_ARRIVAL_EWMA_SMOOTHING ??
        gameConfig.interpolation.arrivalEwmaSmoothing,
    );
    const interpolationJitterEwmaSmoothing = Number(
      process.env.INTERPOLATION_JITTER_EWMA_SMOOTHING ??
        gameConfig.interpolation.jitterEwmaSmoothing,
    );
    const interpolationJitterBufferMultiplier = Number(
      process.env.INTERPOLATION_JITTER_BUFFER_MULTIPLIER ??
        gameConfig.interpolation.jitterBufferMultiplier,
    );
    const interpolationJitterBufferSafetyMs = Number(
      process.env.INTERPOLATION_JITTER_BUFFER_SAFETY_MS ??
        gameConfig.interpolation.jitterBufferSafetyMs,
    );
    const interpolationMaxDebugLogEntries = Number(
      process.env.INTERPOLATION_MAX_DEBUG_LOG_ENTRIES ??
        gameConfig.interpolation.maxDebugLogEntries,
    );
    const interpolationCorrectionFollowSharpness = Number(
      process.env.INTERPOLATION_CORRECTION_FOLLOW_SHARPNESS ??
        gameConfig.interpolation.correctionFollowSharpness,
    );
    const interpolationCorrectionEpsilon = Number(
      process.env.INTERPOLATION_CORRECTION_EPSILON ??
        gameConfig.interpolation.correctionEpsilon,
    );
    const interpolationCorrectionFrameScaleMin = Number(
      process.env.INTERPOLATION_CORRECTION_FRAME_SCALE_MIN ??
        gameConfig.interpolation.correctionFrameScaleMin,
    );
    const interpolationCorrectionFrameScaleMax = Number(
      process.env.INTERPOLATION_CORRECTION_FRAME_SCALE_MAX ??
        gameConfig.interpolation.correctionFrameScaleMax,
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
    if (
      Number.isFinite(dynamicSolverIterations) &&
      Number.isInteger(dynamicSolverIterations) &&
      dynamicSolverIterations >= 1 &&
      dynamicSolverIterations <= 8
    ) {
      gameConfig.collision.dynamicSolverIterations = dynamicSolverIterations;
    }
    if (
      Number.isFinite(dynamicPushScale) &&
      dynamicPushScale > 0 &&
      dynamicPushScale <= 1
    ) {
      gameConfig.collision.dynamicPushScale = dynamicPushScale;
    }
    if (
      Number.isFinite(maxDynamicCorrectionPerTick) &&
      maxDynamicCorrectionPerTick > 0
    ) {
      gameConfig.collision.maxDynamicCorrectionPerTick =
        maxDynamicCorrectionPerTick;
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
      Number.isFinite(interpolationSnapDistance) &&
      interpolationSnapDistance >= 0
    ) {
      gameConfig.interpolation.snapDistance = interpolationSnapDistance;
    }
    if (
      Number.isFinite(interpolationTickDurationSmoothing) &&
      interpolationTickDurationSmoothing > 0 &&
      interpolationTickDurationSmoothing <= 1
    ) {
      gameConfig.interpolation.tickDurationSmoothing =
        interpolationTickDurationSmoothing;
    }
    if (
      Number.isFinite(interpolationRenderDelaySmoothing) &&
      interpolationRenderDelaySmoothing > 0 &&
      interpolationRenderDelaySmoothing <= 1
    ) {
      gameConfig.interpolation.renderDelaySmoothing =
        interpolationRenderDelaySmoothing;
    }
    if (
      Number.isFinite(interpolationMinRenderDelayTicks) &&
      interpolationMinRenderDelayTicks >= 0
    ) {
      gameConfig.interpolation.minRenderDelayTicks =
        interpolationMinRenderDelayTicks;
    }
    if (
      Number.isFinite(interpolationMaxRenderDelayTicks) &&
      interpolationMaxRenderDelayTicks >=
        gameConfig.interpolation.minRenderDelayTicks
    ) {
      gameConfig.interpolation.maxRenderDelayTicks =
        interpolationMaxRenderDelayTicks;
    }
    if (
      Number.isFinite(interpolationMaxExtrapolationTicks) &&
      interpolationMaxExtrapolationTicks >= 0
    ) {
      gameConfig.interpolation.maxExtrapolationTicks =
        interpolationMaxExtrapolationTicks;
    }
    if (
      Number.isFinite(interpolationTickDurationMinFactor) &&
      interpolationTickDurationMinFactor > 0
    ) {
      gameConfig.interpolation.tickDurationMinFactor =
        interpolationTickDurationMinFactor;
    }
    if (
      Number.isFinite(interpolationTickDurationMaxFactor) &&
      interpolationTickDurationMaxFactor >
        gameConfig.interpolation.tickDurationMinFactor
    ) {
      gameConfig.interpolation.tickDurationMaxFactor =
        interpolationTickDurationMaxFactor;
    }
    if (
      Number.isFinite(interpolationArrivalEwmaSmoothing) &&
      interpolationArrivalEwmaSmoothing > 0 &&
      interpolationArrivalEwmaSmoothing <= 1
    ) {
      gameConfig.interpolation.arrivalEwmaSmoothing =
        interpolationArrivalEwmaSmoothing;
    }
    if (
      Number.isFinite(interpolationJitterEwmaSmoothing) &&
      interpolationJitterEwmaSmoothing > 0 &&
      interpolationJitterEwmaSmoothing <= 1
    ) {
      gameConfig.interpolation.jitterEwmaSmoothing =
        interpolationJitterEwmaSmoothing;
    }
    if (
      Number.isFinite(interpolationJitterBufferMultiplier) &&
      interpolationJitterBufferMultiplier >= 0
    ) {
      gameConfig.interpolation.jitterBufferMultiplier =
        interpolationJitterBufferMultiplier;
    }
    if (
      Number.isFinite(interpolationJitterBufferSafetyMs) &&
      interpolationJitterBufferSafetyMs >= 0
    ) {
      gameConfig.interpolation.jitterBufferSafetyMs =
        interpolationJitterBufferSafetyMs;
    }
    if (
      Number.isFinite(interpolationMaxDebugLogEntries) &&
      Number.isInteger(interpolationMaxDebugLogEntries) &&
      interpolationMaxDebugLogEntries >= 100
    ) {
      gameConfig.interpolation.maxDebugLogEntries =
        interpolationMaxDebugLogEntries;
    }
    if (
      Number.isFinite(interpolationCorrectionFollowSharpness) &&
      interpolationCorrectionFollowSharpness > 0
    ) {
      gameConfig.interpolation.correctionFollowSharpness =
        interpolationCorrectionFollowSharpness;
    }
    if (
      Number.isFinite(interpolationCorrectionEpsilon) &&
      interpolationCorrectionEpsilon >= 0
    ) {
      gameConfig.interpolation.correctionEpsilon =
        interpolationCorrectionEpsilon;
    }
    if (
      Number.isFinite(interpolationCorrectionFrameScaleMin) &&
      interpolationCorrectionFrameScaleMin > 0
    ) {
      gameConfig.interpolation.correctionFrameScaleMin =
        interpolationCorrectionFrameScaleMin;
    }
    if (
      Number.isFinite(interpolationCorrectionFrameScaleMax) &&
      interpolationCorrectionFrameScaleMax >=
        gameConfig.interpolation.correctionFrameScaleMin
    ) {
      gameConfig.interpolation.correctionFrameScaleMax =
        interpolationCorrectionFrameScaleMax;
    }
    gameConfig.interpolation.maxRenderDelayTicks = Math.max(
      gameConfig.interpolation.maxRenderDelayTicks,
      gameConfig.interpolation.minRenderDelayTicks,
    );
    gameConfig.interpolation.tickDurationMaxFactor = Math.max(
      gameConfig.interpolation.tickDurationMaxFactor,
      gameConfig.interpolation.tickDurationMinFactor + 0.01,
    );
    gameConfig.interpolation.correctionFrameScaleMax = Math.max(
      gameConfig.interpolation.correctionFrameScaleMax,
      gameConfig.interpolation.correctionFrameScaleMin,
    );
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
