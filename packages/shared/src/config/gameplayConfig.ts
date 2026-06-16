import { z } from "zod";
import type { JsonObject } from "@shared/json.ts";
import { RESOURCE_ID_PATTERN } from "@shared/ids/ResourceId.ts";
import {
  NonNegativeFiniteNumberSchema,
  NonNegativeIntSchema,
  PositiveFiniteNumberSchema,
  PositiveIntSchema,
} from "@shared/validation/schemas.ts";
import { RarityTierSchema } from "@shared/content/schema.ts";
import runtimeRaw from "./runtime.json";
import interactionsRaw from "./interactions.json";
import recyclingRaw from "./recycling.json";
import enemyTuningRaw from "./enemy_tuning.json";
import extractionRaw from "./extraction.json";
import dayNightRaw from "./day_night.json";
import worldgenRaw from "./worldgen.json";
import matchmakingRaw from "./matchmaking.json";
import infrastructureRaw from "./infrastructure.json";
import worldRaw from "./world.json";
import wavesRaw from "./waves.json";

const ResourceIdSchema = z.string().regex(RESOURCE_ID_PATTERN);

const WorldSizeSchema = z.object({
  w: PositiveFiniteNumberSchema,
  h: PositiveFiniteNumberSchema,
});

const RuntimeConfigSchema = z
  .object({
    tickRate: PositiveIntSchema,
    simulationSpeedMultiplier: PositiveFiniteNumberSchema,
    worldSize: WorldSizeSchema,
    collision: z.object({
      spatialCellSize: PositiveIntSchema,
      dynamicSolverIterations: PositiveIntSchema.max(8),
      dynamicPushScale: PositiveFiniteNumberSchema.max(1),
      maxDynamicCorrectionPerTick: PositiveFiniteNumberSchema,
    }),
    network: z.object({
      slotCapacity: PositiveIntSchema,
      maxPacketBytes: PositiveIntSchema,
    }),
    replication: z.object({
      interestRadius: PositiveFiniteNumberSchema,
    }),
    debug: z.object({
      spawnMultiplier: NonNegativeFiniteNumberSchema,
      focusedTrace: z.object({
        entityId: NonNegativeIntSchema.nullable(),
        playerName: z.string(),
      }),
    }),
    interpolation: z.object({
      snapDistance: NonNegativeFiniteNumberSchema,
      historySize: PositiveIntSchema.min(2),
      tickDurationSmoothing: PositiveFiniteNumberSchema.max(1),
      renderDelaySmoothing: PositiveFiniteNumberSchema.max(1),
      minRenderDelayTicks: NonNegativeFiniteNumberSchema,
      maxRenderDelayTicks: NonNegativeFiniteNumberSchema,
      maxExtrapolationTicks: NonNegativeFiniteNumberSchema,
      tickDurationMinFactor: PositiveFiniteNumberSchema,
      tickDurationMaxFactor: PositiveFiniteNumberSchema,
      arrivalEwmaSmoothing: PositiveFiniteNumberSchema.max(1),
      jitterEwmaSmoothing: PositiveFiniteNumberSchema.max(1),
      jitterBufferMultiplier: NonNegativeFiniteNumberSchema,
      jitterBufferSafetyMs: NonNegativeFiniteNumberSchema,
      maxDebugLogEntries: PositiveIntSchema.min(100),
      correctionFollowSharpness: PositiveFiniteNumberSchema,
      correctionEpsilon: NonNegativeFiniteNumberSchema,
      correctionFrameScaleMin: PositiveFiniteNumberSchema,
      correctionFrameScaleMax: PositiveFiniteNumberSchema,
    }),
  })
  .superRefine((config, context) => {
    if (
      config.interpolation.maxRenderDelayTicks <
      config.interpolation.minRenderDelayTicks
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interpolation", "maxRenderDelayTicks"],
        message: "maxRenderDelayTicks must be >= minRenderDelayTicks",
      });
    }
    if (
      config.interpolation.tickDurationMaxFactor <=
      config.interpolation.tickDurationMinFactor
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interpolation", "tickDurationMaxFactor"],
        message: "tickDurationMaxFactor must be > tickDurationMinFactor",
      });
    }
    if (
      config.interpolation.correctionFrameScaleMax <
      config.interpolation.correctionFrameScaleMin
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interpolation", "correctionFrameScaleMax"],
        message: "correctionFrameScaleMax must be >= correctionFrameScaleMin",
      });
    }
  });

const InteractionsConfigSchema = z.object({
  hotbarSlotCount: PositiveIntSchema,
  buildPlacementMaxDistance: PositiveFiniteNumberSchema,
  craftingStationInteractPadding: NonNegativeFiniteNumberSchema,
  craftingStationQueryRadius: PositiveFiniteNumberSchema,
  maxChatMessageLength: PositiveIntSchema,
  chestInteractPadding: NonNegativeFiniteNumberSchema,
  chestInteractRadius: PositiveFiniteNumberSchema,
  chestSlotCount: PositiveIntSchema,
  recyclerInteractPadding: NonNegativeFiniteNumberSchema,
  towerInteractPadding: NonNegativeFiniteNumberSchema,
  interactHoldDurationMs: PositiveIntSchema,
});

const RarityRangeSchema = z.tuple([NonNegativeIntSchema, NonNegativeIntSchema]);

const RecyclingConfigSchema = z
  .object({
    rarityHunkRanges: z.record(RarityTierSchema, RarityRangeSchema),
  })
  .superRefine((config, context) => {
    for (const [tier, [min, max]] of Object.entries(config.rarityHunkRanges)) {
      if (max < min) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rarityHunkRanges", tier],
          message: "max must be >= min",
        });
      }
    }
  });

const EnemyTuningConfigSchema = z.object({
  meleeWeaponCooldownMultiplier: PositiveFiniteNumberSchema,
  rangedDamageMultiplier: PositiveFiniteNumberSchema,
  rangedWeaponCooldownMultiplier: PositiveFiniteNumberSchema,
  weaponAttackRangeMultiplier: PositiveFiniteNumberSchema,
  nightRangedWeaponCooldownMultiplier: PositiveFiniteNumberSchema,
  nightWeaponAttackRangeMultiplier: PositiveFiniteNumberSchema,
  goalLodDistance: NonNegativeFiniteNumberSchema,
  goalLodTickInterval: PositiveIntSchema.max(8),
});

const ExtractionConfigSchema = z.object({
  fallbackHelipad: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    radius: PositiveFiniteNumberSchema,
  }),
  enemyDangerRadius: PositiveFiniteNumberSchema,
  boardTimerGoalTicks: PositiveIntSchema,
  chopperTimerGoalTicks: PositiveIntSchema,
});

const DayNightConfigSchema = z.object({
  dayDurationTicks: PositiveIntSchema,
  nightDurationTicks: PositiveIntSchema,
  stormDamage: z.object({
    damage: NonNegativeFiniteNumberSchema,
    intervalTicks: PositiveIntSchema,
  }),
  fallbackHomeCore: z.object({
    width: PositiveFiniteNumberSchema,
    height: PositiveFiniteNumberSchema,
  }),
});

const DungeonRoomRoleSchema = z.enum([
  "entrance",
  "combat",
  "enemy_swarm",
  "treasure",
  "maze",
  "trap",
  "armory",
  "mini_boss",
  "boss",
]);

const WorldgenConfigSchema = z
  .object({
    seed: z.number().int(),
    gridSize: PositiveIntSchema,
    sectorBands: z.array(PositiveIntSchema).min(1),
    tileSize: PositiveIntSchema,
    targetVillageCount: PositiveIntSchema,
    villageCenterMargin: z.object({
      x: NonNegativeFiniteNumberSchema,
      y: NonNegativeFiniteNumberSchema,
    }),
    lobbyWorldSize: WorldSizeSchema,
    requiredDungeonRoomRoles: z.array(DungeonRoomRoleSchema).min(1),
  })
  .superRefine((config, context) => {
    if (config.gridSize !== config.sectorBands.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sectorBands"],
        message: "sectorBands length must match gridSize",
      });
    }
  });

const MatchmakingConfigSchema = z.object({
  maxPlayers: PositiveIntSchema,
  startCountdownMs: PositiveIntSchema,
  codeLength: PositiveIntSchema,
});

const InfrastructureConfigSchema = z.object({
  towerXOffset: PositiveFiniteNumberSchema,
});

const WorldConfigSchema = z.object({
  outerPlayerBuildingDecayTicks: PositiveIntSchema,
  forestCampRespawnRadius: PositiveFiniteNumberSchema,
});

const WaveSpawnConfigSchema = z.object({
  entityTypeId: ResourceIdSchema,
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  delayTicks: NonNegativeIntSchema,
  count: PositiveIntSchema,
});

const NightWaveConfigSchema = z.object({
  nightCycle: PositiveIntSchema,
  spawns: z.array(WaveSpawnConfigSchema),
  message: z.string().optional(),
});

const RandomWaveEnemyWeightSchema = z.object({
  entityTypeId: ResourceIdSchema,
  tier: RarityTierSchema,
  weight: PositiveFiniteNumberSchema,
});

const RandomWaveTierFloorSchema = z.object({
  nightCycle: PositiveIntSchema,
  floors: z.partialRecord(RarityTierSchema, NonNegativeIntSchema),
  allowedTiers: z.array(RarityTierSchema).min(1),
});

const RandomWavesConfigSchema = z.object({
  enabled: z.boolean(),
  baseBudget: PositiveIntSchema,
  budgetPerNight: NonNegativeIntSchema,
  bucketDelayTicks: z.array(NonNegativeIntSchema).min(1),
  enemyWeights: z.array(RandomWaveEnemyWeightSchema).min(1),
  tierFloors: z.array(RandomWaveTierFloorSchema).min(1),
});

const WavesConfigSchema = z.object({
  waves: z.array(NightWaveConfigSchema),
  randomWaves: RandomWavesConfigSchema,
  defaultMessageTemplate: z.string().min(1),
  waveSpawn: z.object({
    minRadius: PositiveFiniteNumberSchema,
    maxRadius: PositiveFiniteNumberSchema,
  }),
});

function parseConfig<T>(
  name: string,
  schema: z.ZodType<T>,
  rawConfig: unknown,
): T {
  const parsed = schema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new Error(`Invalid shared config ${name}: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const runtimeConfig = parseConfig(
  "runtime.json",
  RuntimeConfigSchema,
  runtimeRaw,
);
export const interactionsConfig = parseConfig(
  "interactions.json",
  InteractionsConfigSchema,
  interactionsRaw,
);
export const recyclingConfig = parseConfig(
  "recycling.json",
  RecyclingConfigSchema,
  recyclingRaw,
);
export const enemyTuningConfig = parseConfig(
  "enemy_tuning.json",
  EnemyTuningConfigSchema,
  enemyTuningRaw,
);
export const extractionConfig = parseConfig(
  "extraction.json",
  ExtractionConfigSchema,
  extractionRaw,
);
export const dayNightConfig = parseConfig(
  "day_night.json",
  DayNightConfigSchema,
  dayNightRaw,
);
export const worldgenConfig = parseConfig(
  "worldgen.json",
  WorldgenConfigSchema,
  worldgenRaw,
);
export const matchmakingConfig = parseConfig(
  "matchmaking.json",
  MatchmakingConfigSchema,
  matchmakingRaw,
);
export const infrastructureConfig = parseConfig(
  "infrastructure.json",
  InfrastructureConfigSchema,
  infrastructureRaw,
);
export const worldConfig = parseConfig(
  "world.json",
  WorldConfigSchema,
  worldRaw,
);
export const wavesConfig = parseConfig(
  "waves.json",
  WavesConfigSchema,
  wavesRaw,
);

/** Night when the second extraction Thanos is spawned (matches final tier floor). */
export function getExtractionLegendaryBossUnlockNightCycle(): number {
  const tierFloors = wavesConfig.randomWaves.tierFloors;
  if (tierFloors.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(...tierFloors.map((floor) => floor.nightCycle));
}

export const GAMEPLAY_CONFIG_COMPAT_DESCRIPTOR: JsonObject = Object.freeze({
  runtime: runtimeConfig as JsonObject,
  interactions: interactionsConfig as JsonObject,
  recycling: recyclingConfig as JsonObject,
  enemyTuning: enemyTuningConfig as JsonObject,
  extraction: extractionConfig as JsonObject,
  dayNight: dayNightConfig as JsonObject,
  worldgen: worldgenConfig as JsonObject,
  matchmaking: matchmakingConfig as JsonObject,
  infrastructure: infrastructureConfig as JsonObject,
  world: worldConfig as JsonObject,
  waves: wavesConfig as JsonObject,
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export type InteractionsConfig = z.infer<typeof InteractionsConfigSchema>;
export type RecyclingConfig = z.infer<typeof RecyclingConfigSchema>;
export type EnemyTuningConfig = z.infer<typeof EnemyTuningConfigSchema>;
export type ExtractionConfig = z.infer<typeof ExtractionConfigSchema>;
export type DayNightConfig = z.infer<typeof DayNightConfigSchema>;
export type WorldgenConfig = z.infer<typeof WorldgenConfigSchema>;
export type MatchmakingConfig = z.infer<typeof MatchmakingConfigSchema>;
export type InfrastructureConfig = z.infer<typeof InfrastructureConfigSchema>;
export type WorldConfig = z.infer<typeof WorldConfigSchema>;
export type WavesConfig = z.infer<typeof WavesConfigSchema>;
export type NightWaveConfig = z.infer<typeof NightWaveConfigSchema>;
export type WaveSpawnConfig = z.infer<typeof WaveSpawnConfigSchema>;
