import type { EntitySnapshot, WorldSnapshot } from "@shared/net/snapshots.ts";
import { getEntitySnapshotFingerprint } from "@server/net/snapshots/SnapshotFingerprint.ts";
import type { World } from "@server/world/World.ts";

/**
 * Tick-scoped cache of serialized entity snapshots and version fingerprints.
 */
export class SnapshotTickCache {
  private preparedTick = -1;
  private preparedDayNight: WorldSnapshot["dayNight"] | null = null;
  private readonly snapshotByEntityId = new Map<number, EntitySnapshot>();
  private readonly previousFingerprintByEntityId = new Map<number, string>();
  private readonly snapshotVersionByEntityId = new Map<number, number>();

  public prepare(world: World): void {
    this.preparedTick = world.tick;
    this.preparedDayNight = world.dayNightSystem.toSnapshot();
    this.snapshotByEntityId.clear();

    for (const entity of world.entities.all()) {
      const snapshot = entity.toSnapshot() as EntitySnapshot;
      const nextFingerprint = getEntitySnapshotFingerprint(snapshot);
      const previousFingerprint = this.previousFingerprintByEntityId.get(
        entity.id,
      );
      const previousVersion =
        this.snapshotVersionByEntityId.get(entity.id) ?? 0;

      this.snapshotByEntityId.set(entity.id, snapshot);
      this.snapshotVersionByEntityId.set(
        entity.id,
        previousFingerprint === nextFingerprint
          ? previousVersion
          : previousVersion + 1,
      );
      this.previousFingerprintByEntityId.set(entity.id, nextFingerprint);
    }

    for (const entityId of [...this.snapshotVersionByEntityId.keys()]) {
      if (this.snapshotByEntityId.has(entityId)) {
        continue;
      }
      this.snapshotVersionByEntityId.delete(entityId);
      this.previousFingerprintByEntityId.delete(entityId);
    }
  }

  public getPreparedTick(): number {
    return this.preparedTick;
  }

  public getDayNightSnapshot(): WorldSnapshot["dayNight"] | null {
    return this.preparedDayNight;
  }

  public getSnapshot(entityId: number): EntitySnapshot | undefined {
    return this.snapshotByEntityId.get(entityId);
  }

  public getSnapshotVersion(entityId: number): number {
    return this.snapshotVersionByEntityId.get(entityId) ?? 0;
  }
}
