import type { NetEvent } from "@shared/net/events.ts";
import type { EntitySnapshot, WorldSnapshot } from "@shared/net/snapshots.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";

/**
 * Serializes authoritative world state after each completed server tick.
 * This keeps snapshot construction concerns out of GameServer.
 */
export class SnapshotManager {
  private preparedTick = -1;
  private preparedEvents: readonly NetEvent[] = [];
  private readonly snapshotByEntityId = new Map<number, EntitySnapshot>();
  private readonly queryBuffer: Entity[] = [];

  /**
   * Caches entity snapshots once per tick so per-client replication can reuse them.
   */
  public prepareTick(world: World, events: readonly NetEvent[]): void {
    this.preparedTick = world.tick;
    this.preparedEvents = events;
    this.snapshotByEntityId.clear();

    for (const entity of world.entities.all()) {
      this.snapshotByEntityId.set(
        entity.id,
        entity.toSnapshot() as EntitySnapshot,
      );
    }
  }

  public makeSnapshotForPlayer(
    world: World,
    playerId: number,
    interestRadius: number,
  ): WorldSnapshot {
    if (this.preparedTick !== world.tick) {
      this.prepareTick(world, []);
    }

    const player = world.get<Player>(playerId);
    if (!player) {
      return {
        tick: world.tick,
        dayNight: world.dayNightSystem.toSnapshot(),
        entities: [],
        events: [...this.preparedEvents],
      };
    }

    const minX = player.x - interestRadius;
    const minY = player.y - interestRadius;
    const maxX = player.x + interestRadius;
    const maxY = player.y + interestRadius;
    const includedIds = new Set<number>([playerId]);

    for (const entity of world.spatial.queryBox(
      minX,
      minY,
      maxX,
      maxY,
      this.queryBuffer,
    )) {
      includedIds.add(entity.id);
    }

    const entities = [...includedIds]
      .sort((leftId, rightId) => leftId - rightId)
      .flatMap((entityId) => {
        const snapshot = this.snapshotByEntityId.get(entityId);
        return snapshot ? [snapshot] : [];
      });

    return {
      tick: world.tick,
      dayNight: world.dayNightSystem.toSnapshot(),
      entities,
      events: [...this.preparedEvents],
    };
  }
}
