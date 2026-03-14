import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import type { NetEvent } from "@shared/net/events.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer";
import { ClientEntity } from "@client/net/ClientEntity.ts";

/**
 * Client-side world representation that owns entity render objects.
 * Needs a PixiRenderer so new entities can attach their Pixi graphics to the scene.
 */
export class ClientWorld {
  public tick: number;
  public timeMs: number;
  public entities: ClientEntity[];
  public events: NetEvent[];
  private pixiRenderer: PixiRenderer;

  constructor(pixiRenderer: PixiRenderer, snapshot: WorldSnapshot) {
    this.pixiRenderer = pixiRenderer;
    this.tick = snapshot.tick;
    this.timeMs = snapshot.timeMs;
    this.entities = snapshot.entities.map(
      (entitySnapshot) => new ClientEntity(this.pixiRenderer, entitySnapshot),
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
  }

  /**
   * Updates this world from a new snapshot.
   * Updates existing entities or creates new ones as needed.
   */
  public updateFromSnapshot(snapshot: WorldSnapshot): void {
    this.tick = snapshot.tick;
    this.timeMs = snapshot.timeMs;
    this.events = [...snapshot.events];

    const updatedEntityIds = new Set<number>();

    for (const entitySnapshot of snapshot.entities) {
      updatedEntityIds.add(entitySnapshot.id);

      const existingEntity = this.entities.find(
        (entity) => entity.id === entitySnapshot.id,
      ); // hella slow but its ok for now
      if (existingEntity) {
        existingEntity.updateFromSnapshot(entitySnapshot);
      } else {
        const newEntity = new ClientEntity(this.pixiRenderer, entitySnapshot);
        this.entities.push(newEntity);
      }
    }

    this.entities = this.entities.filter((entity) => {
      if (!updatedEntityIds.has(entity.id)) {
        entity.destroy();
        return false;
      }
      return true;
    });
  }
}
