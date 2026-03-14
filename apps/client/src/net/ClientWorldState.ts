import type { WorldSnapshot, EntitySnapshot, ItemStackSnapshot } from "@shared/net/snapshots.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer";
import type { EntityKind } from "@shared/ids/EntityKinds.ts";
import type { ItemKind } from "@shared/ids/ItemKinds";
import type { NetEvent } from "@shared/net/events.ts";
import type { PixiContainer, PixiGraphics } from "@client/render/PixiTypes.ts";

/**
 * Stores the latest authoritative snapshot received from the server.
 */

export class ClientWorldState {
  pixiRenderer: PixiRenderer;
  public latestSnapshot?: WorldSnapshot;
  
  public clientWorld?: InstanceType<typeof ClientWorldState.ClientWorld>;

  /**
   * Creates empty client-side world state. Must have a reference to the PixiRenderer to create ClientEntity instances with Pixi objects.
   * window.PIXI must be available and initialized
   */
  constructor(pixiRenderer: PixiRenderer) {
    if (!window.PIXI){
      throw new Error("PIXI is not available on the window object.");
    }
    this.pixiRenderer = pixiRenderer;
  }

  /**
   * Replaces the local present-state with a fresh authoritative snapshot.
   * @param snapshot Authoritative snapshot to apply.
   */
  pushSnapshot(snapshot: WorldSnapshot): void {
    this.latestSnapshot = snapshot;
    if (!this.clientWorld) {
      this.clientWorld = new ClientWorldState.ClientWorld(this.pixiRenderer, snapshot);
    } else {
      this.clientWorld.updateFromSnapshot(snapshot);
    }
  }

  public clear(): void {
    this.latestSnapshot = undefined;
    if (this.clientWorld) {
      this.clientWorld.destroy();
      this.clientWorld = undefined;
    }
  }

  
  /**
   * Client-side representation of one entity with readonly properties.
   */
  static ClientEntity = class {
    public readonly id: number;
    public readonly kind: EntityKind;

    /*
    IMPORTANT!!!!
    
    FOLLOWING ATTRIBUTES ARE PUBLIC FOR EASE OF ACCESS BUT SHOULD NOT BE MODIFIED DIRECTLY
    INSTEAD SHOULD BE MODIFIED THROUGH update FUNCTIONS TO ENSURE PIXI OBJECTS ARE UPDATED PROPERLY
    */
    public x: number;
    public y: number;
    public vx: number;
    public vy: number;
    public rotation: number;
    public radius: number;
    public hp?: number;
    public maxHp?: number;
    public ownerId?: number;


    
    private entityContainer: PixiContainer;
    private entityGraphic: PixiGraphics; 

    private pixiRenderer: PixiRenderer; //Needed because subclass doesnt inherent parent class properties

    constructor(pixiRenderer: PixiRenderer, snapshot: EntitySnapshot) {
      this.id = snapshot.id;
      this.kind = snapshot.kind;
      this.x = snapshot.x;
      this.y = snapshot.y;
      this.vx = snapshot.vx;
      this.vy = snapshot.vy;
      this.rotation = snapshot.rotation;
      this.radius = snapshot.radius;
      this.hp = snapshot.hp;
      this.maxHp = snapshot.maxHp;
      this.ownerId = snapshot.ownerId;
      this.pixiRenderer = pixiRenderer;


      if (!window.PIXI){
        throw new Error("PIXI is not available on the window object.");
      }

      //initiate pixi objects
      this.entityContainer = new window.PIXI.Container();
      this.entityContainer.position.set(this.x, this.y);
      this.entityContainer.rotation = this.rotation;

      if (!this.pixiRenderer.entityContainer){
        throw new Error("Pixi Renderer entity container not initialized.");
      }

      this.pixiRenderer.entityContainer.addChild(this.entityContainer);


      // Create a centered green circle with a black border.
      // Pixi.Graphics is used here; it is centered at (0,0) when the circle is drawn at (0,0).
      const graphics = new window.PIXI.Graphics();
      graphics.lineStyle(2, 0x000000, 1);
      if (this.kind == "player") {
        graphics.beginFill(0x00ff00, 1);
      } else if (this.kind == "enemy") {
        graphics.beginFill(0xbf2a2a, 1);
      } else {
        throw new Error(`Unknown entity kind: ${this.kind}`);
      }
      graphics.drawCircle(0, 0, this.radius);
      graphics.endFill();

      // Center the graphic via its pivot (similar to sprite anchor 0.5)
      graphics.pivot.set(0, 0);

      this.entityGraphic = graphics;

      // Add the graphic to the entity container.
      this.entityContainer.addChild(this.entityGraphic);
    }

    /**
     * Updates this entity from a new snapshot.
     * Throws if the snapshot id does not match.
     */
    public updatePosition(x: number, y: number): void {
      this.x = x;
      this.y = y;
      this.entityContainer.position.set(this.x, this.y);

      if (this.pixiRenderer.playerEntityId === this.id) {
        this.pixiRenderer.setCameraToPlayer(this.x, this.y);
      }
    }

    public updateFromSnapshot(snapshot: EntitySnapshot): void {
      if (snapshot.id !== this.id) {
        throw new Error(
          `Snapshot id (${snapshot.id}) does not match entity id (${this.id}).`,
        );
      }

      // Update basic state

      this.updatePosition(snapshot.x, snapshot.y);
      this.vx = snapshot.vx;
      this.vy = snapshot.vy;
      this.rotation = snapshot.rotation;
      this.hp = snapshot.hp;
      this.maxHp = snapshot.maxHp;
      this.ownerId = snapshot.ownerId;

      // Update visuals
      this.entityContainer.rotation = this.rotation;

      if (snapshot.radius !== this.radius) {
        this.radius = snapshot.radius;
        this.entityGraphic.clear();
        this.entityGraphic.lineStyle(2, 0x000000, 1);
        this.entityGraphic.beginFill(0x00ff00, 1);
        this.entityGraphic.drawCircle(0, 0, this.radius);
        this.entityGraphic.endFill();
      }
    }

    /**
     * Cleans up Pixi objects and removes this entity from the scene.
     */
    public destroy(): void {
      // Remove the entity container from the renderer's entity container
      if (this.pixiRenderer.entityContainer && this.entityContainer.parent) {
        this.pixiRenderer.entityContainer.removeChild(this.entityContainer);
      }

      // Clean up Pixi objects
      this.entityGraphic.destroy();
      this.entityContainer.destroy();
    }

  };

  /**
   * Client-side representation of full world state with readonly properties.
   * Combines replicated entities with any discrete events emitted for that frame.
   */
  static ClientWorld = class {
    public tick: number;
    public timeMs: number;
    public entities: InstanceType<typeof ClientWorldState.ClientEntity>[];
    public events: NetEvent[];
    private pixiRenderer: PixiRenderer;

    constructor(pixiRenderer: PixiRenderer, snapshot: WorldSnapshot) {
      this.pixiRenderer = pixiRenderer;
      this.tick = snapshot.tick;
      this.timeMs = snapshot.timeMs;
      this.entities = snapshot.entities.map(
          (entitySnapshot) => new ClientWorldState.ClientEntity(this.pixiRenderer, entitySnapshot),
        );
      this.events = [...snapshot.events];
    }

    /**
     * Updates this world from a new snapshot.
     * Updates existing entities or creates new ones as needed.
     */

    public destroy(): void {
      for (const entity of this.entities.values()) {
        entity.destroy();
      }
    }

    public updateFromSnapshot(snapshot: WorldSnapshot): void {
      this.tick = snapshot.tick;
      this.timeMs = snapshot.timeMs;
      this.events = [...snapshot.events];

      // Update or create entities
      const updatedEntityIds = new Set<number>();

      for (const entitySnapshot of snapshot.entities) {
        updatedEntityIds.add(entitySnapshot.id);

        const existingEntity = this.entities.find((e) => e.id === entitySnapshot.id); //hella slow but its ok for now
        if (existingEntity) {
          // Update existing entity
          existingEntity.updateFromSnapshot(entitySnapshot);
        } else {
          // Create new entity
          const newEntity = new ClientWorldState.ClientEntity(this.pixiRenderer, entitySnapshot);
          this.entities.push(newEntity);
        }
      }


      this.entities = this.entities.filter(entity => {
        if (!updatedEntityIds.has(entity.id)) {
          entity.destroy();
          return false;
        }
        return true;
      });
    }



  };

  /**
   * Client-side representation of an item stack with readonly properties.
   */
  static ClientItemStack = class {
    public readonly id: number;
    public readonly kind: ItemKind;
    public readonly stackSize: number;
    public readonly ownerId?: number;

    constructor(snapshot: ItemStackSnapshot) {
      this.id = snapshot.id;
      this.kind = snapshot.kind;
      this.stackSize = snapshot.stackSize;
      this.ownerId = snapshot.ownerId;
    }
  };
}
