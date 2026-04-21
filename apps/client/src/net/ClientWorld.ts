import { ClientEntity } from "@client/net/ClientEntity.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import { EntityRenderManager } from "@client/render/EntityRenderManager.ts";
import type { EntityPresentationState } from "@client/render/entity/EntityRenderer.ts";
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
  public version = 1;

  private readonly debugHitbox: boolean;
  private readonly pixiRenderer?: PixiRenderer;
  private readonly debugInterpolationMode: number;
  private readonly serverFrameHistoryLimit: number;
  private readonly renderManager?: EntityRenderManager;
  private readonly dirtyEntityIds = new Set<number>();
  private confusionEnabled = false;
  private confusionIntensity = 0;

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
        new ClientEntity(entitySnapshot, tick, this.serverFrameHistoryLimit),
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
    this.confusionEnabled = false;
    this.confusionIntensity = 0;
  }

  public updateFromSnapshot(snapshot: WorldSnapshot, tick: number): void {
    this.tick = tick;
    this.events = [...snapshot.events];
    this.dayNight = snapshot.dayNight;

    const isFullSnapshot = snapshot.full !== false;
    let worldChanged = this.events.length > 0;
    if (isFullSnapshot) {
      this.dirtyEntityIds.clear();
    }

    for (const entitySnapshot of snapshot.entities) {
      if (isFullSnapshot) {
        this.dirtyEntityIds.add(entitySnapshot.id);
      }

      const existingEntity = this.entities.get(entitySnapshot.id);
      if (existingEntity) {
        const previousStateVersion = existingEntity.stateVersion;
        existingEntity.updateFromSnapshot(entitySnapshot, tick);
        if (existingEntity.stateVersion !== previousStateVersion) {
          this.renderManager?.syncEntity(existingEntity);
          worldChanged = true;
        }
      } else {
        const entity = new ClientEntity(
          entitySnapshot,
          tick,
          this.serverFrameHistoryLimit,
        );
        this.entities.set(entitySnapshot.id, entity);
        this.renderManager?.syncEntity(entity);
        worldChanged = true;
      }
    }

    this.applyEvents(snapshot.events);

    if (isFullSnapshot) {
      for (const [entityId] of this.entities) {
        if (!this.dirtyEntityIds.has(entityId)) {
          this.renderManager?.removeEntity(entityId);
          this.entities.delete(entityId);
          worldChanged = true;
        }
      }
    } else {
      const removedEntityIds = snapshot.removedEntityIds;
      if (removedEntityIds) {
        for (const removedEntityId of removedEntityIds) {
          if (!this.entities.has(removedEntityId)) {
            continue;
          }
          this.renderManager?.removeEntity(removedEntityId);
          this.entities.delete(removedEntityId);
          worldChanged = true;
        }
      }
    }

    if (worldChanged) {
      this.version += 1;
    }
  }

  public update(deltaMs: number): void {
    this.renderManager?.update(deltaMs, this.entities.values());
    this.updateConfusionVisuals();
  }

  public setPresentationOverride(
    entityId: number,
    presentation: EntityPresentationState | null,
  ): void {
    this.renderManager?.setPresentationOverride(entityId, presentation);
  }

  public playAttackAnimation(entityId: number | undefined): void {
    if (entityId === undefined) {
      return;
    }
    const entity = this.entities.get(entityId);
    if (!entity) {
      return;
    }
    this.renderManager?.triggerAttackAnimation(entity);
  }

  private updateConfusionVisuals(): void {
    if (!this.pixiRenderer) {
      return;
    }

    const playerEntityId = this.pixiRenderer.playerEntityId;
    if (playerEntityId === undefined) {
      this.syncConfusionState(false, 0);
      return;
    }

    const player = this.entities.get(playerEntityId);
    const confusionEffect = player?.activeEffects?.find(
      (e) => e.typeId === "effect:confusion",
    );

    if (!confusionEffect) {
      this.syncConfusionState(false, 0);
      return;
    }

    // Confusion fades out over 80 ticks.
    const fadeOutTicks = 80;
    const intensity = Math.min(
      1,
      confusionEffect.ticksRemaining / fadeOutTicks,
    );
    this.syncConfusionState(true, intensity);
  }

  private syncConfusionState(active: boolean, intensity: number): void {
    const normalizedIntensity = Math.max(0, Math.min(1, intensity));
    if (
      this.confusionEnabled === active &&
      Math.abs(this.confusionIntensity - normalizedIntensity) < 0.001
    ) {
      return;
    }

    this.confusionEnabled = active;
    this.confusionIntensity = normalizedIntensity;
    this.pixiRenderer?.setConfusionState(active, normalizedIntensity);
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
