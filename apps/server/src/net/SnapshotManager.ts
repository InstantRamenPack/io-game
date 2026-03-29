import type { NetEvent } from "@shared/net/events.ts";
import type { EntitySnapshot, WorldSnapshot } from "@shared/net/snapshots.ts";
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
  private readonly collidableQueryBuffer: Array<ReturnType<World["get"]>> = [];

  /**
   * Caches entity snapshots once per tick so per-client replication can reuse them.
   */
  prepareTick(world: World, events: readonly NetEvent[]): void {
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

  makeSnapshotForPlayer(
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
    const entities: EntitySnapshot[] = [];

    for (const entity of world.spatial.queryBox(
      minX,
      minY,
      maxX,
      maxY,
      this.collidableQueryBuffer as never[],
    )) {
      includedIds.add(entity.id);
    }

    for (const entity of world.entities.nonCollidable()) {
      if (
        entity.x < minX ||
        entity.x > maxX ||
        entity.y < minY ||
        entity.y > maxY
      ) {
        continue;
      }
      includedIds.add(entity.id);
    }

    for (const entity of world.entities.all()) {
      if (!includedIds.has(entity.id)) {
        continue;
      }
      const snapshot = this.snapshotByEntityId.get(entity.id);
      if (snapshot) {
        entities.push(snapshot);
      }
    }

    return {
      tick: world.tick,
      dayNight: world.dayNightSystem.toSnapshot(),
      entities,
      events: [...this.preparedEvents],
    };
  }
}
