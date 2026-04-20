import type { World } from "@server/world/World.ts";
import { entityTypeRegistry } from "@server/registry/registries.ts";
import {
  isSpawnableEntityCtor,
  type SpawnableEntityCtor,
} from "@server/runtime/ctorGuards.ts";
import { readFileSync } from "node:fs";
import { z } from "zod";

type WaveChatBroadcaster = {
  broadcastSystemMessage?: (text: string) => void;
};

/**
 * Configuration for a single entity spawn in a wave.
 */
type WaveSpawnConfig = {
  /** Entity resource type name (e.g., "drifter", "shoota") */
  entityType: string;
  /** X coordinate for spawn */
  x: number;
  /** Y coordinate for spawn */
  y: number;
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
};

/**
 * Top-level wave configuration file structure.
 */
type WavesConfigFile = {
  waves: NightWaveConfig[];
};

const WaveSpawnConfigSchema = z.object({
  entityType: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  delayTicks: z.number().int().nonnegative(),
  count: z.number().int().positive(),
});

const NightWaveConfigSchema = z.object({
  nightCycle: z.number().int().positive(),
  spawns: z.array(WaveSpawnConfigSchema),
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
   * @param nightCycle The night cycle number (1-indexed)
   */
  public onNightStart(nightCycle: number): void {
    this.pendingSpawns = [];

    const waveConfig = this.wavesConfig.waves.find(
      (w) => w.nightCycle === nightCycle,
    );

    if (!waveConfig) {
      return;
    }

    for (const spawn of waveConfig.spawns) {
      this.pendingSpawns.push({
        spawn,
        ticksRemaining: spawn.delayTicks,
      });
    }

    if (this.chatService?.broadcastSystemMessage) {
      this.chatService.broadcastSystemMessage(
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

    for (let i = 0; i < spawnConfig.count; i++) {
      const entityId = world.allocEntityId();
      const entity = new entityCtor(entityId);

      const offsetX = world.randomNumberGenerator() * 40 - 20;
      const offsetY = world.randomNumberGenerator() * 40 - 20;
      entity.x = spawnConfig.x + offsetX;
      entity.y = spawnConfig.y + offsetY;

      entity.x = Math.max(0, Math.min(entity.x, world.gameConfig.worldSize.w));
      entity.y = Math.max(0, Math.min(entity.y, world.gameConfig.worldSize.h));

      world.spawn(entity);
    }
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
