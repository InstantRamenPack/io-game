import type { ClientWorld } from "@client/net/ClientWorld.ts";
import type { WorldPresentationEvent } from "@client/net/presentation/WorldPresentationEvent.ts";
import { EntityRenderManager } from "@client/render/EntityRenderManager.ts";
import type { EntityPresentationState } from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";

export class PixiWorldPresentationSink {
  private readonly renderManager: EntityRenderManager;
  private readonly syncedEntityIds = new Set<number>();

  constructor(
    private readonly renderer: PixiRenderer,
    options: {
      debugHitbox?: boolean;
      debugInterpolationMode?: number;
    } = {},
  ) {
    this.renderManager = new EntityRenderManager(renderer, {
      debugHitbox: options.debugHitbox ?? false,
      debugInterpolationMode: options.debugInterpolationMode ?? 0,
    });
  }

  public reset(): void {
    this.renderManager.destroy();
    this.syncedEntityIds.clear();
    this.renderer.setConfusionState(false, 0);
  }

  public setPlayerEntityId(entityId: number | undefined): void {
    this.renderer.setPlayerEntityId(entityId);
  }

  public syncWorld(world: ClientWorld): void {
    for (const entity of world.entities.values()) {
      this.renderManager.syncEntity(entity);
      this.syncedEntityIds.add(entity.id);
    }

    for (const entityId of [...this.syncedEntityIds]) {
      if (world.entities.has(entityId)) {
        continue;
      }
      this.renderManager.removeEntity(entityId);
      this.syncedEntityIds.delete(entityId);
    }
  }

  public update(deltaMs: number, world: ClientWorld): void {
    this.renderManager.update(deltaMs);
    this.updateConfusion(world);
  }

  public setPresentationOverride(
    entityId: number,
    presentation: EntityPresentationState | null,
  ): void {
    this.renderManager.setPresentationOverride(entityId, presentation);
  }

  public playAttackAnimation(
    entityId: number | undefined,
    world: ClientWorld,
  ): void {
    if (entityId === undefined) {
      return;
    }

    const entity = world.entities.get(entityId);
    if (!entity) {
      return;
    }
    this.renderManager.triggerAttackAnimation(entity);
  }

  public applyEvents(events: readonly WorldPresentationEvent[]): void {
    for (const event of events) {
      if (event.type === "explosion") {
        this.renderer.triggerExplosionEffect(
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

      this.renderManager.triggerDamageFlash(event.payload.targetId);
      if (event.payload.targetId === this.renderer.playerEntityId) {
        this.renderer.triggerDamageOverlay();
      }
    }
  }

  private updateConfusion(world: ClientWorld): void {
    const playerEntityId = this.renderer.playerEntityId;
    if (playerEntityId === undefined) {
      this.renderer.setConfusionState(false, 0);
      return;
    }

    const player = world.entities.get(playerEntityId);
    const confusionEffect = player?.activeEffects?.find(
      (effect) => effect.typeId === "effect:confusion",
    );
    if (!confusionEffect) {
      this.renderer.setConfusionState(false, 0);
      return;
    }

    const fadeOutTicks = 80;
    const intensity = Math.min(
      1,
      confusionEffect.ticksRemaining / fadeOutTicks,
    );
    this.renderer.setConfusionState(true, intensity);
  }
}
