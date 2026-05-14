import type { World } from "@server/world/World.ts";
import { entityTypeRegistry } from "@server/registry/registries.ts";
import {
  isSpawnableEntityCtor,
  type SpawnableEntityCtor,
} from "@server/runtime/ctorGuards.ts";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";

type WaveChatBroadcaster = {
  broadcastSystemMessage?: (text: string) => void;
};

/**
 * Configuration for a single entity spawn in a wave.
 */
type WaveSpawnConfig = {
  /** Entity resource type name (e.g., "drifter", "shoota") */
  entityType: string;
  /** X coordinate for spawn — omit to use a random home-perimeter position */
  x?: number;
  /** Y coordinate for spawn — omit to use a random home-perimeter position */
  y?: number;
  /** Delay in ticks before this spawn occurs */
  delayTicks: number;
  /** Number of entities to spawn */
  count: number;
};

/**
 * Configuration for a complete wave during a night cycle.
 */
type NightWaveConfig = {
  /** Which night cycle this wave belongs to (1-indexed) */
  nightCycle: number;
  /** All spawns that occur during this night */
  spawns: WaveSpawnConfig[];
  /** Optional override for the wave arrival chat broadcast */
  message?: string;
};

/**
 * Top-level wave configuration file structure.
 */
type WavesConfigFile = {
  waves: NightWaveConfig[];
};

const WaveSpawnConfigSchema = z.object({
  entityType: z.string().min(1),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  delayTicks: z.number().int().nonnegative(),
  count: z.number().int().positive(),
});

const NightWaveConfigSchema = z.object({
  nightCycle: z.number().int().positive(),
  spawns: z.array(WaveSpawnConfigSchema),
  message: z.string().optional(),
});

const WavesConfigFileSchema = z.object({
  waves: z.array(NightWaveConfigSchema),
});

/**
 * Internal state for tracking a pending spawn.
 */
type PendingSpawn = {
  spawn: WaveSpawnConfig;
  ticksRemaining: number;
};

/**
 * Manages wave spawning mechanics tied to the day/night cycle.
 * Loads wave configuration from JSON and spawns entities at the start of each night
 * according to the configured delays.
 */
export class WaveSpawner {
  private readonly wavesConfig: WavesConfigFile;
  private readonly entityCtorByResourceName: Map<string, SpawnableEntityCtor>;
  private readonly chatService: WaveChatBroadcaster | null;
  private pendingSpawns: PendingSpawn[] = [];

  /**
   * Creates a wave spawner with the given configuration.
   * Builds internal lookup tables for fast entity type resolution.
   * @param wavesConfig The loaded waves configuration
   * @param chatService Optional chat service for broadcasting wave notifications
   */
  constructor(
    wavesConfig: WavesConfigFile,
    chatService: WaveChatBroadcaster | null = null,
  ) {
    this.wavesConfig = wavesConfig;
    this.chatService = chatService;
    this.entityCtorByResourceName = this.buildEntityLookup();
  }

  /**
   * Builds a lookup map from resource names to entity constructors.
   * This enables fast entity type resolution during spawning.
   */
  private buildEntityLookup(): Map<string, SpawnableEntityCtor> {
    const lookup = new Map<string, SpawnableEntityCtor>();

    for (const [, entry] of entityTypeRegistry.entries()) {
      const resourceName = entry.ctor.resourceName ?? "";
      if (resourceName) {
        if (!isSpawnableEntityCtor(entry.ctor)) {
          throw new Error(
            `Entity type ${entry.typeId} is not spawnable by the wave system.`,
          );
        }
        lookup.set(resourceName, entry.ctor);
      }
    }

    return lookup;
  }

  /**
   * Static factory method to load wave configuration from a JSON file.
   * @param configPath Path to the waves.json configuration file
   * @param chatService Optional chat service for notifications
   * @returns Loaded WaveSpawner instance
   */
  public static loadFromFile(
    configPath: string,
    chatService: WaveChatBroadcaster | null = null,
  ): WaveSpawner {
    const jsonText = readFileSync(configPath, "utf-8");
    const parsedConfig = WavesConfigFileSchema.safeParse(JSON.parse(jsonText));
    if (!parsedConfig.success) {
      throw new Error(
        `Invalid wave configuration at ${configPath}: ${parsedConfig.error.message}`,
      );
    }
    const config = parsedConfig.data;
    return new WaveSpawner(config, chatService);
  }

  /**
   * Called when a night cycle begins. Queues all spawns for the current night.
   * Cycles 1–7 are loaded from the JSON config; cycles 8+ are generated procedurally.
   * @param nightCycle The night cycle number (1-indexed)
   */
  public onNightStart(nightCycle: number): void {
    this.pendingSpawns = [];

    const waveConfig = this.wavesConfig.waves.find(
      (w) => w.nightCycle === nightCycle,
    );

    let resolvedConfig: NightWaveConfig;

    if (waveConfig) {
      resolvedConfig = waveConfig;
    } else if (nightCycle > 7) {
      resolvedConfig = this.generateRandomWave(nightCycle);
    } else {
      console.warn(
        `Wave spawner: no config found for night cycle ${nightCycle}`,
      );
      return;
    }

    for (const spawn of resolvedConfig.spawns) {
      this.pendingSpawns.push({
        spawn,
        ticksRemaining: spawn.delayTicks,
      });
    }

    if (this.chatService?.broadcastSystemMessage) {
      this.chatService.broadcastSystemMessage(
        resolvedConfig.message ??
          `🌙 Wave ${nightCycle} approaching! Enemies incoming!`,
      );
    }
  }

  /**
   * Updates the wave spawner each tick, processing delayed spawns.
   * Should be called once per server tick.
   * @param world The world to spawn entities into
   * @param isNight Whether it's currently night time
   */
  public update(world: World, isNight: boolean): void {
    if (!isNight || this.pendingSpawns.length === 0) {
      return;
    }

    const spawnsToRemove: number[] = [];

    for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
      const pending = this.pendingSpawns[i];
      if (!pending) {
        continue;
      }

      pending.ticksRemaining -= 1;

      if (pending.ticksRemaining <= 0) {
        this.spawnEntities(world, pending.spawn);
        spawnsToRemove.push(i);
      }
    }

    for (const i of spawnsToRemove) {
      this.pendingSpawns.splice(i, 1);
    }
  }

  /**
   * Internal method to spawn multiple entities of the same type at a location.
   * When x/y are not specified in spawnConfig, entities spawn at a random point
   * just outside the home sector perimeter so they always approach from a fresh angle.
   * Wave-spawned enemies receive an infinite-range TargetEntityGoal (priority -1) so
   * they pursue players across the entire map regardless of their class-default aggro.
   * @param world The world to spawn into
   * @param spawnConfig Configuration for this spawn
   */
  private spawnEntities(world: World, spawnConfig: WaveSpawnConfig): void {
    const entityCtor = this.entityCtorByResourceName.get(
      spawnConfig.entityType,
    );

    if (!entityCtor) {
      console.warn(
        `Wave spawner: no entity registered with resource name "${spawnConfig.entityType}"`,
      );
      return;
    }

    const worldCenterX = world.gameConfig.worldSize.w / 2;
    const worldCenterY = world.gameConfig.worldSize.h / 2;
    // Home sector is 4096×4096 centered at world center.
    // Pick a random side of the square and spawn 400px outside the boundary,
    // guaranteeing enemies always start outside the home sector.
    const sectorHalf = 2048;
    const buffer = 400;

    let baseX: number;
    let baseY: number;

    if (spawnConfig.x !== undefined && spawnConfig.y !== undefined) {
      baseX = spawnConfig.x;
      baseY = spawnConfig.y;
    } else {
      const side = Math.floor(world.randomNumberGenerator() * 4);
      const t = world.randomNumberGenerator();
      const edgeMin = worldCenterX - sectorHalf;
      const edgeSpan = sectorHalf * 2;
      switch (side) {
        case 0: // North
          baseX = edgeMin + t * edgeSpan;
          baseY = worldCenterY - sectorHalf - buffer;
          break;
        case 1: // South
          baseX = edgeMin + t * edgeSpan;
          baseY = worldCenterY + sectorHalf + buffer;
          break;
        case 2: // West
          baseX = worldCenterX - sectorHalf - buffer;
          baseY = edgeMin + t * edgeSpan;
          break;
        default: // East
          baseX = worldCenterX + sectorHalf + buffer;
          baseY = edgeMin + t * edgeSpan;
          break;
      }
    }

    for (let i = 0; i < spawnConfig.count; i++) {
      const entityId = world.allocEntityId();
      const entity = new entityCtor(entityId);

      const offsetX = world.randomNumberGenerator() * 40 - 20;
      const offsetY = world.randomNumberGenerator() * 40 - 20;
      entity.x = baseX + offsetX;
      entity.y = baseY + offsetY;

      entity.x = Math.max(0, Math.min(entity.x, world.gameConfig.worldSize.w));
      entity.y = Math.max(0, Math.min(entity.y, world.gameConfig.worldSize.h));

      world.spawn(entity);

      // Priority -1 overrides the class-default TargetEntityGoal (priority 0).
      // 9000px covers the full home sector from any perimeter spawn point (~4950px max),
      // ensuring wave enemies always find players without affecting non-wave enemies.
      if (entity instanceof Enemy) {
        entity.goalSelector.add(
          new TargetEntityGoal<Enemy>(-1, Player, 9000, {
            requireLineOfSight: true,
          }),
        );
      }
    }
  }

  /**
   * Procedurally generates a scaled wave config for night cycles beyond the 7 fixed waves.
   * Enemy counts grow by 20% per wave. Elite types unlock progressively after wave 9.
   * Spawns are distributed evenly across 7 delay buckets spanning the first quarter of night.
   * @param nightCycle The night cycle number (must be > 7)
   */
  private generateRandomWave(nightCycle: number): NightWaveConfig {
    const scale = 1.0 + (nightCycle - 7) * 0.2;

    type EnemyEntry = { entityType: string; count: number };
    const pool: EnemyEntry[] = [
      { entityType: "drifter", count: Math.round(10 * scale) },
      { entityType: "shoota", count: Math.round(6 * scale) },
      { entityType: "bomber", count: Math.round(3 * scale) },
      { entityType: "police", count: Math.round(3 * scale) },
      { entityType: "saboteur", count: Math.round(4 * scale) },
      { entityType: "wallbreaker", count: Math.round(2 * scale) },
      ...(nightCycle >= 9
        ? [
            {
              entityType: "commander",
              count: Math.round((nightCycle - 8) * 0.5),
            },
          ]
        : []),
      ...(nightCycle >= 10
        ? [
            {
              entityType: "megaknight",
              count: Math.round((nightCycle - 9) * 0.8),
            },
          ]
        : []),
      ...(nightCycle >= 12
        ? [
            {
              entityType: "stalker",
              count: Math.round((nightCycle - 11) * 0.6),
            },
          ]
        : []),
      ...(nightCycle >= 13
        ? [{ entityType: "sniper", count: Math.round((nightCycle - 12) * 0.5) }]
        : []),
    ].filter((e) => e.count > 0);

    const DELAY_BUCKETS = [0, 40, 80, 120, 160, 210, 260] as const;
    const spawns: WaveSpawnConfig[] = [];

    for (const { entityType, count } of pool) {
      const perBucket = Math.floor(count / DELAY_BUCKETS.length);
      let remainder = count % DELAY_BUCKETS.length;

      for (const delay of DELAY_BUCKETS) {
        const batchCount = perBucket + (remainder > 0 ? 1 : 0);
        remainder = Math.max(0, remainder - 1);
        if (batchCount > 0) {
          spawns.push({ entityType, delayTicks: delay, count: batchCount });
        }
      }
    }

    return {
      nightCycle,
      spawns,
      message: `🌙 Wave ${nightCycle} — ${scale.toFixed(1)}x difficulty — Prepare for the horde!`,
    };
  }

  /**
   * Returns the number of pending spawns waiting to occur.
   * Useful for debugging or UI purposes.
   */
  public getPendingSpawnCount(): number {
    return this.pendingSpawns.length;
  }

  /**
   * Returns detailed information about all pending spawns.
   * Useful for debugging.
   */
  public getPendingSpawnDetails(): Array<{
    entityType: string;
    count: number;
    ticksRemaining: number;
  }> {
    const details = new Map<
      string,
      { count: number; minTicksRemaining: number }
    >();

    for (const pending of this.pendingSpawns) {
      const key = pending.spawn.entityType;
      const existing = details.get(key);

      if (existing) {
        existing.count += pending.spawn.count;
        existing.minTicksRemaining = Math.min(
          existing.minTicksRemaining,
          pending.ticksRemaining,
        );
      } else {
        details.set(key, {
          count: pending.spawn.count,
          minTicksRemaining: pending.ticksRemaining,
        });
      }
    }

    return Array.from(details.entries()).map(([entityType, data]) => ({
      entityType,
      count: data.count,
      ticksRemaining: data.minTicksRemaining,
    }));
  }
}
