import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import type { NetEvent } from "@shared/net/events.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer";
import { ClientEntity } from "@client/net/ClientEntity.ts";

/**
 * Client-side world representation that owns entity render objects in an id-keyed map.
 * Needs a PixiRenderer so new entities can attach their Pixi graphics to the scene.
 */
export class ClientWorld {
  public tick: number;
  public entities: Map<number, ClientEntity>;
  public events: NetEvent[];
  private readonly debugHitbox: boolean;
  private pixiRenderer: PixiRenderer;
  private readonly debugInterpolationMode: number;

  constructor(
    pixiRenderer: PixiRenderer,
    snapshot: WorldSnapshot,
    debugHitbox: boolean,
    debugInterpolationMode: number,
  ) {
    this.pixiRenderer = pixiRenderer;
    this.debugHitbox = debugHitbox;
    this.debugInterpolationMode = debugInterpolationMode;
    this.tick = snapshot.tick;
    this.entities = new Map(
      snapshot.entities.map((entitySnapshot) => [
        entitySnapshot.id,
        new ClientEntity(
          this.pixiRenderer,
          entitySnapshot,
          this.debugHitbox,
          this.debugInterpolationMode,
        ),
      ]),
    );
    this.events = [...snapshot.events];
  }

  /**
   * Cleans up Pixi objects for all entities.
   */
  public destroy(): void {
    for (const entity of this.entities.values()) {
      entity.destroy();
    }
    this.entities.clear();
  }

  /**
   * Updates this world from a new snapshot.
   * Updates existing entities or creates new ones as needed.
   */
  public updateFromSnapshot(snapshot: WorldSnapshot): void {
    this.tick = snapshot.tick;
    this.events = [...snapshot.events];

    const updatedEntityIds = new Set<number>();

    for (const entitySnapshot of snapshot.entities) {
      updatedEntityIds.add(entitySnapshot.id);

      const existingEntity = this.entities.get(entitySnapshot.id);
      if (existingEntity) {
        existingEntity.updateFromSnapshot(entitySnapshot);
      } else {
        const newEntity = new ClientEntity(
          this.pixiRenderer,
          entitySnapshot,
          this.debugHitbox,
          this.debugInterpolationMode,
        );
        this.entities.set(entitySnapshot.id, newEntity);
      }
    }

    for (const [entityId, entity] of this.entities) {
      if (!updatedEntityIds.has(entityId)) {
        entity.destroy();
        this.entities.delete(entityId);
      }
    }
  }
}
