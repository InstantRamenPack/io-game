import { ClientEntity } from "@client/net/ClientEntity.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type { NetEvent } from "@shared/net/events.ts";
import type { DayNightSnapshot, WorldSnapshot } from "@shared/net/snapshots.ts";

/**
 * Client-side world representation that owns entity instances and, when a
 * renderer is provided, lets those entities manage their own Pixi objects.
 * This restores the older net-layer orchestration while still allowing
 * renderer-free construction in tests.
 */
export class ClientWorld {
  public tick: number;
  public entities: Map<number, ClientEntity>;
  public events: NetEvent[];
  public dayNight: DayNightSnapshot;

  private readonly debugHitbox: boolean;
  private readonly pixiRenderer?: PixiRenderer;
  private readonly debugInterpolationMode: number;

  public constructor(
    snapshot: WorldSnapshot,
    pixiRenderer?: PixiRenderer,
    debugHitbox = false,
    debugInterpolationMode = 0,
  ) {
    this.pixiRenderer = pixiRenderer;
    this.debugHitbox = debugHitbox;
    this.debugInterpolationMode = debugInterpolationMode;
    this.tick = snapshot.tick;
    this.dayNight = snapshot.dayNight;
    this.entities = new Map(
      snapshot.entities.map((entitySnapshot) => [
        entitySnapshot.id,
        new ClientEntity(entitySnapshot, {
          pixiRenderer: this.pixiRenderer,
          debugHitbox: this.debugHitbox,
          debugInterpolationMode: this.debugInterpolationMode,
        }),
      ]),
    );
    this.events = [...snapshot.events];
    this.applyEvents(snapshot.events);
  }

  /**
   * Cleans up entity-owned presentation objects and clears the entity map.
   */
  public destroy(): void {
    for (const entity of this.entities.values()) {
      entity.destroy();
    }
    this.entities.clear();
    this.events = [];
  }

  /**
   * Applies a new authoritative snapshot, updating existing entities or
   * creating new ones as needed. Damage and overlay events are processed here,
   * matching the older client-world responsibility split.
   */
  public updateFromSnapshot(snapshot: WorldSnapshot): void {
    this.tick = snapshot.tick;
    this.events = [...snapshot.events];
    this.dayNight = snapshot.dayNight;

    const updatedEntityIds = new Set<number>();

    for (const entitySnapshot of snapshot.entities) {
      updatedEntityIds.add(entitySnapshot.id);

      const existingEntity = this.entities.get(entitySnapshot.id);
      if (existingEntity) {
        existingEntity.updateFromSnapshot(entitySnapshot);
      } else {
        this.entities.set(
          entitySnapshot.id,
          new ClientEntity(entitySnapshot, {
            pixiRenderer: this.pixiRenderer,
            debugHitbox: this.debugHitbox,
            debugInterpolationMode: this.debugInterpolationMode,
          }),
        );
      }
    }

    this.applyEvents(snapshot.events);

    for (const [entityId, entity] of this.entities) {
      if (!updatedEntityIds.has(entityId)) {
        entity.destroy();
        this.entities.delete(entityId);
      }
    }
  }

  /**
   * Advances presentation-only effects on the tracked entities.
   */
  public update(deltaMs: number): void {
    for (const entity of this.entities.values()) {
      entity.update(deltaMs);
    }
  }

  private applyEvents(events: NetEvent[]): void {
    for (const event of events) {
      if (event.type !== "damage") {
        continue;
      }

      this.entities.get(event.payload.targetId)?.triggerDamageFlash();
      if (event.payload.targetId === this.pixiRenderer?.playerEntityId) {
        this.pixiRenderer.triggerDamageOverlay();
      }
    }
  }
}
