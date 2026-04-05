import type { World } from "@server/world/World.ts";
import { entityTypeRegistry } from "@server/registry/registries.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { readFileSync } from "node:fs";

type WaveChatBroadcaster = {
  broadcastSystemMessage?: (text: string) => void;
};

/**
 * Configuration for a single entity spawn in a wave.
 */
export type WaveSpawnConfig = {
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
export type NightWaveConfig = {
  /** Which night cycle this wave belongs to (1-indexed) */
  nightCycle: number;
  /** All spawns that occur during this night */
  spawns: WaveSpawnConfig[];
};

/**
 * Top-level wave configuration file structure.
 */
export type WavesConfigFile = {
  waves: NightWaveConfig[];
};

/**
 * Internal state for tracking a pending spawn.
 */
type PendingSpawn = {
  spawn: WaveSpawnConfig;
  ticksRemaining: number;
};

type SpawnableEntityCtor = new (entityId: number) => Entity;

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
  private currentNightCycle = 0;

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
      const entityTypeCtor = entry.ctor as unknown as typeof Entity;
      const resourceName = entityTypeCtor.resourceName ?? "";
      if (resourceName) {
        lookup.set(resourceName, entry.ctor as unknown as SpawnableEntityCtor);
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
    const config = JSON.parse(jsonText) as WavesConfigFile;
    return new WaveSpawner(config, chatService);
  }

  /**
   * Called when a night cycle begins. Queues all spawns for the current night.
   * @param nightCycle The night cycle number (1-indexed)
   */
  public onNightStart(nightCycle: number): void {
    this.currentNightCycle = nightCycle;
    this.pendingSpawns = [];

    // Find the wave configuration for this night cycle
    const waveConfig = this.wavesConfig.waves.find(
      (w) => w.nightCycle === nightCycle,
    );

    if (!waveConfig) {
      // No spawns configured for this night
      return;
    }

    // Queue all spawns for this night
    for (const spawn of waveConfig.spawns) {
      this.pendingSpawns.push({
        spawn,
        ticksRemaining: spawn.delayTicks,
      });
    }

    // Broadcast wave start message
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
      // Only process spawns during night and when there are pending spawns
      return;
    }

    // Process all pending spawns
    const spawnsToRemove: number[] = [];

    for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
      const pending = this.pendingSpawns[i];
      if (!pending) {
        continue;
      }

      pending.ticksRemaining -= 1;

      if (pending.ticksRemaining <= 0) {
        // Time to spawn
        this.spawnEntities(world, pending.spawn);
        spawnsToRemove.push(i);
      }
    }

    // Remove completed spawns (iterate from highest index to avoid shifting issues)
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

      // Position the entity with some slight randomization to avoid perfect overlap
      const offsetX = world.randomNumberGenerator() * 40 - 20;
      const offsetY = world.randomNumberGenerator() * 40 - 20;
      entity.x = spawnConfig.x + offsetX;
      entity.y = spawnConfig.y + offsetY;

      // Clamp to world bounds
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
