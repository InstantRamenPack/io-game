import type { EntitySnapshot, WorldSnapshot } from "@shared/net/snapshots.ts";
import { getEntityRuntimeFingerprint } from "@server/net/snapshots/SnapshotFingerprint.ts";
import type { World } from "@server/world/World.ts";

/**
 * Tick-scoped cache of serialized entity snapshots and version fingerprints.
 */
export class SnapshotTickCache {
  private preparedTick = -1;
  private preparedDayNight: WorldSnapshot["dayNight"] | null = null;
  private readonly snapshotByEntityId = new Map<number, EntitySnapshot>();
  private readonly previousFingerprintByEntityId = new Map<number, string>();
  private readonly previousSnapshotByEntityId = new Map<
    number,
    EntitySnapshot
  >();
  private readonly snapshotVersionByEntityId = new Map<number, number>();

  public prepare(world: World): void {
    this.preparedTick = world.tick;
    this.preparedDayNight = world.dayNightSystem.toSnapshot();
    this.snapshotByEntityId.clear();

    for (const entity of world.entities.all()) {
      const nextFingerprint = getEntityRuntimeFingerprint(entity);
      const previousFingerprint = this.previousFingerprintByEntityId.get(
        entity.id,
      );
      const previousSnapshot = this.previousSnapshotByEntityId.get(entity.id);
      const previousVersion =
        this.snapshotVersionByEntityId.get(entity.id) ?? 0;

      if (previousFingerprint === nextFingerprint && previousSnapshot) {
        this.snapshotByEntityId.set(entity.id, previousSnapshot);
        continue;
      }

      const snapshot = entity.toSnapshot() as EntitySnapshot;
      this.snapshotByEntityId.set(entity.id, snapshot);
      this.previousSnapshotByEntityId.set(entity.id, snapshot);
      this.snapshotVersionByEntityId.set(entity.id, previousVersion + 1);
      this.previousFingerprintByEntityId.set(entity.id, nextFingerprint);
    }

    for (const entityId of [...this.snapshotVersionByEntityId.keys()]) {
      if (this.snapshotByEntityId.has(entityId)) {
        continue;
      }
      this.snapshotVersionByEntityId.delete(entityId);
      this.previousFingerprintByEntityId.delete(entityId);
      this.previousSnapshotByEntityId.delete(entityId);
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
