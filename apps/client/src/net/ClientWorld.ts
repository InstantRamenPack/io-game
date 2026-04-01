import { ClientEntity } from "@client/net/ClientEntity.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import { EntityRenderManager } from "@client/render/EntityRenderManager.ts";
import type { NetEvent } from "@shared/net/events.ts";
import type { DayNightSnapshot, WorldSnapshot } from "@shared/net/snapshots.ts";

/**
 * Client-side world representation that owns replica entities and, when a
 * renderer is provided, delegates presentation lifecycle to the render manager.
 */
export class ClientWorld {
  public tick: number;
  public entities: Map<number, ClientEntity>;
  public events: NetEvent[];
  public dayNight: DayNightSnapshot;

  private readonly debugHitbox: boolean;
  private readonly pixiRenderer?: PixiRenderer;
  private readonly debugInterpolationMode: number;
  private readonly serverFrameHistoryLimit: number;
  private readonly renderManager?: EntityRenderManager;

  constructor(
    snapshot: WorldSnapshot,
    tick: number,
    serverFrameHistoryLimit: number,
    pixiRenderer?: PixiRenderer,
    debugHitbox = false,
    debugInterpolationMode = 0,
  ) {
    this.pixiRenderer = pixiRenderer;
    this.debugHitbox = debugHitbox;
    this.debugInterpolationMode = debugInterpolationMode;
    this.serverFrameHistoryLimit = Math.max(
      2,
      Math.floor(serverFrameHistoryLimit),
    );
    if (this.pixiRenderer?.entityContainer) {
      this.renderManager = new EntityRenderManager(this.pixiRenderer, {
        debugHitbox: this.debugHitbox,
        debugInterpolationMode: this.debugInterpolationMode,
      });
    }
    this.tick = tick;
    this.dayNight = snapshot.dayNight;
    this.entities = new Map(
      snapshot.entities.map((entitySnapshot) => [
        entitySnapshot.id,
        new ClientEntity(
          entitySnapshot,
          tick,
          this.serverFrameHistoryLimit,
        ),
      ]),
    );
    this.events = [...snapshot.events];
    for (const entity of this.entities.values()) {
      this.renderManager?.syncEntity(entity);
    }
    this.applyEvents(snapshot.events);
  }

  public destroy(): void {
    this.renderManager?.destroy();
    this.entities.clear();
    this.events = [];
  }

  public updateFromSnapshot(snapshot: WorldSnapshot, tick: number): void {
    this.tick = tick;
    this.events = [...snapshot.events];
    this.dayNight = snapshot.dayNight;

    const updatedEntityIds = new Set<number>();

    for (const entitySnapshot of snapshot.entities) {
      updatedEntityIds.add(entitySnapshot.id);

      const existingEntity = this.entities.get(entitySnapshot.id);
      if (existingEntity) {
        existingEntity.updateFromSnapshot(entitySnapshot, tick);
        this.renderManager?.syncEntity(existingEntity);
      } else {
        const entity = new ClientEntity(
          entitySnapshot,
          tick,
          this.serverFrameHistoryLimit,
        );
        this.entities.set(entitySnapshot.id, entity);
        this.renderManager?.syncEntity(entity);
      }
    }

    this.applyEvents(snapshot.events);

    for (const [entityId] of this.entities) {
      if (!updatedEntityIds.has(entityId)) {
        this.renderManager?.removeEntity(entityId);
        this.entities.delete(entityId);
      }
    }
  }

  public update(deltaMs: number): void {
    this.renderManager?.update(deltaMs, this.entities.values());
  }

  private applyEvents(events: NetEvent[]): void {
    for (const event of events) {
      if (event.type === "explosion") {
        this.pixiRenderer?.triggerExplosionEffect(
          event.payload.x,
          event.payload.y,
          event.payload.radius,
          event.payload.style,
        );
        continue;
      }

      if (event.type !== "damage") {
        continue;
      }

      this.renderManager?.triggerDamageFlash(event.payload.targetId);
      if (event.payload.targetId === this.pixiRenderer?.playerEntityId) {
        this.pixiRenderer.triggerDamageOverlay();
      }
    }
  }
}
