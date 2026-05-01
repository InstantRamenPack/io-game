import { ClientEntity } from "@client/net/ClientEntity.ts";
import type { NetEvent } from "@shared/net/events.ts";
import type { DayNightSnapshot, WorldSnapshot } from "@shared/net/snapshots.ts";

/**
 * Client-side world representation that owns authoritative replica state only.
 */
export class ClientWorld {
  public tick: number;
  public entities: Map<number, ClientEntity>;
  public events: NetEvent[];
  public dayNight: DayNightSnapshot;
  public version = 1;

  private readonly serverFrameHistoryLimit: number;
  private readonly dirtyEntityIds = new Set<number>();

  constructor(
    snapshot: WorldSnapshot,
    tick: number,
    serverFrameHistoryLimit: number,
  ) {
    this.serverFrameHistoryLimit = Math.max(
      2,
      Math.floor(serverFrameHistoryLimit),
    );
    this.tick = tick;
    this.dayNight = snapshot.dayNight;
    this.entities = new Map(
      snapshot.entities.map((entitySnapshot) => [
        entitySnapshot.id,
        new ClientEntity(entitySnapshot, tick, this.serverFrameHistoryLimit),
      ]),
    );
    this.events = [...snapshot.events];
  }

  public destroy(): void {
    this.entities.clear();
    this.events = [];
  }

  public updateFromSnapshot(snapshot: WorldSnapshot, tick: number): void {
    this.tick = tick;
    this.events = [...snapshot.events];
    this.dayNight = snapshot.dayNight;

    const isFullSnapshot = snapshot.full !== false;
    let worldChanged = this.events.length > 0;
    const touchedEntityIds = new Set<number>();
    if (isFullSnapshot) {
      this.dirtyEntityIds.clear();
    }

    for (const entitySnapshot of snapshot.entities) {
      touchedEntityIds.add(entitySnapshot.id);
      if (isFullSnapshot) {
        this.dirtyEntityIds.add(entitySnapshot.id);
      }

      const existingEntity = this.entities.get(entitySnapshot.id);
      if (existingEntity) {
        const previousStateVersion = existingEntity.stateVersion;
        existingEntity.updateFromSnapshot(entitySnapshot, tick, isFullSnapshot);
        if (existingEntity.stateVersion !== previousStateVersion) {
          worldChanged = true;
        }
      } else {
        const entity = new ClientEntity(
          entitySnapshot,
          tick,
          this.serverFrameHistoryLimit,
        );
        this.entities.set(entitySnapshot.id, entity);
        worldChanged = true;
      }
    }

    if (isFullSnapshot) {
      for (const [entityId] of this.entities) {
        if (!this.dirtyEntityIds.has(entityId)) {
          this.entities.delete(entityId);
          worldChanged = true;
        }
      }
    } else {
      const removedEntityIds = snapshot.removedEntityIds;
      if (removedEntityIds) {
        for (const removedEntityId of removedEntityIds) {
          touchedEntityIds.add(removedEntityId);
          if (!this.entities.has(removedEntityId)) {
            continue;
          }
          this.entities.delete(removedEntityId);
          worldChanged = true;
        }
      }

      for (const entity of this.entities.values()) {
        if (!touchedEntityIds.has(entity.id)) {
          entity.pushServerHoldFrame(tick);
        }
      }
    }

    if (worldChanged) {
      this.version += 1;
    }
  }
}
