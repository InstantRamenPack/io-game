import type { World } from "@server/world/World.ts";
import { entityTypeRegistry } from "@server/registry/registries.ts";
import {
  isSpawnableEntityCtor,
  type SpawnableEntityCtor,
} from "@server/runtime/ctorGuards.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import {
  wavesConfig,
  type NightWaveConfig,
  type WavesConfig,
  type WaveSpawnConfig,
} from "@shared/config/gameplayConfig.ts";
import { getLegendaryBossTypeIds } from "@shared/world/legendaryBoss.ts";

type WaveChatBroadcaster = {
  broadcastSystemMessage?: (text: string) => void;
};

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
  private readonly wavesConfig: WavesConfig;
  private readonly entityCtorByResourceName: Map<string, SpawnableEntityCtor>;
  private readonly chatService: WaveChatBroadcaster | null;
  private readonly legendaryBossResourceNames: ReadonlySet<string>;
  private pendingSpawns: PendingSpawn[] = [];
  private nightWaveThreatTotal = 0;

  /**
   * Creates a wave spawner with the given configuration.
   * Builds internal lookup tables for fast entity type resolution.
   * @param wavesConfig The loaded waves configuration
   * @param chatService Optional chat service for broadcasting wave notifications
   */
  constructor(
    wavesConfig: WavesConfig,
    chatService: WaveChatBroadcaster | null = null,
  ) {
    this.wavesConfig = wavesConfig;
    this.chatService = chatService;
    this.entityCtorByResourceName = this.buildEntityLookup();
    this.legendaryBossResourceNames = new Set(
      getLegendaryBossTypeIds().map((typeId) => typeId.replace(/^enemy:/, "")),
    );
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

  public static fromSharedConfig(
    chatService: WaveChatBroadcaster | null = null,
  ): WaveSpawner {
    return new WaveSpawner(wavesConfig, chatService);
  }

  public canEndNight(world: World): boolean {
    return (
      this.countAliveWaveEnemies(world) === 0 && this.pendingSpawns.length === 0
    );
  }

  public countAliveWaveEnemies(world: World): number {
    let count = 0;
    for (const entity of world.entities.all()) {
      if (
        entity instanceof Enemy &&
        entity.alive &&
        entity.spawnSource === "wave"
      ) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Called when a night cycle begins. Queues all spawns for the current night.
   * Authored waves can still override a specific night; otherwise weighted
   * random waves are generated from shared JSON.
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
    } else if (this.wavesConfig.randomWaves.enabled) {
      resolvedConfig = this.generateRandomWave(nightCycle);
    } else {
      console.warn(
        `Wave spawner: no config found for night cycle ${nightCycle}`,
      );
      return;
    }

    const hasNonPoliceSpawn = resolvedConfig.spawns.some(
      (spawn) => spawn.entityType !== "police" && spawn.count > 0,
    );

    for (const spawn of resolvedConfig.spawns) {
      if (spawn.entityType === "police" && !hasNonPoliceSpawn) {
        continue;
      }
      this.pendingSpawns.push({
        spawn,
        ticksRemaining: spawn.delayTicks,
      });
    }

    if (this.chatService?.broadcastSystemMessage) {
      this.chatService.broadcastSystemMessage(
        resolvedConfig.message ??
          this.wavesConfig.defaultMessageTemplate.replace(
            "{nightCycle}",
            String(nightCycle),
          ),
      );
    }

    this.nightWaveThreatTotal = this.getPendingWaveEnemyCount();
  }

  public getNightWaveThreatTotal(): number {
    return this.nightWaveThreatTotal;
  }

  public getPendingWaveEnemyCount(): number {
    return this.pendingSpawns.reduce(
      (sum, pending) => sum + pending.spawn.count,
      0,
    );
  }

  public getRemainingWaveThreat(world: World): number {
    return this.countAliveWaveEnemies(world) + this.getPendingWaveEnemyCount();
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
   * Spawns wave enemies near map center so buildings draw aggro when players stay distant.
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
    const { minRadius, maxRadius } = this.wavesConfig.waveSpawn;

    let baseX: number;
    let baseY: number;

    if (spawnConfig.x !== undefined && spawnConfig.y !== undefined) {
      baseX = spawnConfig.x;
      baseY = spawnConfig.y;
    } else {
      const angle = world.randomNumberGenerator() * Math.PI * 2;
      const radiusSpan = Math.max(0, maxRadius - minRadius);
      const radius = minRadius + world.randomNumberGenerator() * radiusSpan;
      baseX = worldCenterX + Math.cos(angle) * radius;
      baseY = worldCenterY + Math.sin(angle) * radius;
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

      if (entity instanceof Enemy) {
        entity.spawnSource = "wave";
      }

      world.spawn(entity);
    }
  }

  /**
   * Generates a deterministic weighted wave from shared JSON knobs.
   * @param nightCycle The night cycle number
   */
  private generateRandomWave(nightCycle: number): NightWaveConfig {
    const randomWaves = this.wavesConfig.randomWaves;
    const floorConfig = this.resolveTierFloor(nightCycle);
    const allowedTierSet = new Set(floorConfig.allowedTiers);
    const weightedPool = this.filterWaveEnemyWeights(
      randomWaves.enemyWeights,
      (entry) => allowedTierSet.has(entry.tier),
    );
    const counts = new Map<string, number>();
    const rng = this.createNightCycleRandom(nightCycle);
    const increment = (entityType: string, amount = 1): void => {
      counts.set(entityType, (counts.get(entityType) ?? 0) + amount);
    };

    for (const [tier, count] of Object.entries(floorConfig.floors)) {
      if (!count) {
        continue;
      }
      const tierPool = this.filterWaveEnemyWeights(
        randomWaves.enemyWeights,
        (entry) => entry.tier === tier,
      );
      for (let index = 0; index < count; index += 1) {
        increment(this.pickWeightedEntity(tierPool, rng));
      }
    }

    const floorTotal = Object.values(floorConfig.floors).reduce(
      (sum, count) => sum + (count ?? 0),
      0,
    );
    const targetBudget =
      randomWaves.baseBudget +
      Math.max(0, nightCycle - 1) * randomWaves.budgetPerNight;
    const randomBudget = Math.max(0, targetBudget - floorTotal);
    for (let index = 0; index < randomBudget; index += 1) {
      increment(this.pickWeightedEntity(weightedPool, rng));
    }

    const DELAY_BUCKETS = randomWaves.bucketDelayTicks;
    const spawns: WaveSpawnConfig[] = [];

    for (const [entityType, count] of counts) {
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
      message: this.wavesConfig.defaultMessageTemplate.replace(
        "{nightCycle}",
        String(nightCycle),
      ),
    };
  }

  private resolveTierFloor(
    nightCycle: number,
  ): WavesConfig["randomWaves"]["tierFloors"][number] {
    const floors = [...this.wavesConfig.randomWaves.tierFloors].sort(
      (left, right) => left.nightCycle - right.nightCycle,
    );
    let resolved = floors[0];
    for (const floor of floors) {
      if (floor.nightCycle > nightCycle) {
        break;
      }
      resolved = floor;
    }
    if (!resolved) {
      throw new Error("Random wave config needs at least one tier floor.");
    }
    return resolved;
  }

  private createNightCycleRandom(nightCycle: number): () => number {
    let state = (0x9e3779b9 ^ Math.imul(nightCycle, 0x85ebca6b)) >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  private filterWaveEnemyWeights<T extends { entityType: string }>(
    pool: readonly T[],
    predicate: (entry: T) => boolean,
  ): T[] {
    return pool.filter(
      (entry) =>
        predicate(entry) &&
        !this.legendaryBossResourceNames.has(entry.entityType),
    );
  }

  private pickWeightedEntity(
    pool: readonly WavesConfig["randomWaves"]["enemyWeights"][number][],
    randomNumber: () => number,
  ): string {
    if (pool.length === 0) {
      throw new Error("Random wave pool is empty for the selected tier floor.");
    }
    const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = randomNumber() * totalWeight;
    for (const entry of pool) {
      roll -= entry.weight;
      if (roll <= 0) {
        return entry.entityType;
      }
    }
    const fallback = pool[pool.length - 1] ?? pool[0];
    if (!fallback) {
      throw new Error("Random wave pool is empty.");
    }
    return fallback.entityType;
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
