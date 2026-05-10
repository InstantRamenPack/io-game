import type { ClientWorld } from "@client/net/ClientWorld.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { WorldPresentationEvent } from "@client/net/presentation/WorldPresentationEvent.ts";
import { EntityRenderManager } from "@client/render/EntityRenderManager.ts";
import type { EntityPresentationState } from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type { VisibilityBlockerShape } from "@client/render/renderTypes.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

const TREE_VISIBILITY_RADIUS_SCALE = 0.7;
const CIRCULAR_VISIBILITY_BLOCKER_TYPE_IDS = new Set<ResourceId>([
  "structure:tree",
  "building:tree",
]);
const NON_VISIBILITY_BLOCKER_TYPE_IDS = new Set<ResourceId>([
  "building:landmine",
]);

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
    this.renderer.setVisibilityBlockers([]);
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
    this.updateVisibility(world);
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

      if (event.type === "attack") {
        this.renderManager.triggerAttackAnimationByEntityId(
          event.payload.sourceId,
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

  private updateVisibility(world: ClientWorld): void {
    if (
      this.renderer.playerX === undefined ||
      this.renderer.playerY === undefined
    ) {
      this.renderer.setVisibilityBlockers([]);
      return;
    }

    const blockers: VisibilityBlockerShape[] = [];

    for (const entity of world.entities.values()) {
      if (!isVisibilityBlockerEntity(entity)) {
        continue;
      }
      const blocker = toVisibilityBlocker(entity);
      if (!blocker) {
        continue;
      }
      blockers.push(blocker);
    }

    this.renderer.setVisibilityBlockers(blockers);
  }
}

function isVisibilityBlockerEntity(entity: ClientEntity): boolean {
  if (!entity.alive) {
    return false;
  }
  if (NON_VISIBILITY_BLOCKER_TYPE_IDS.has(entity.typeId)) {
    return false;
  }
  return entity.kind === "building" || entity.kind === "structure";
}

function toVisibilityBlocker(
  entity: ClientEntity,
): VisibilityBlockerShape | null {
  const bounds = entity.hitboxBounds;
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  if (isCircularVisibilityBlocker(entity)) {
    // Use the larger hitbox dimension so tree canopies fully occlude LOS.
    const radius =
      Math.max(bounds.width, bounds.height) *
      0.5 *
      TREE_VISIBILITY_RADIUS_SCALE;
    return {
      kind: "circle",
      sourceEntityId: entity.id,
      centerX: entity.x + bounds.centerX,
      centerY: entity.y + bounds.centerY,
      radius,
    };
  }

  return {
    kind: "rect",
    sourceEntityId: entity.id,
    minX: entity.x + bounds.minX,
    minY: entity.y + bounds.minY,
    maxX: entity.x + bounds.maxX,
    maxY: entity.y + bounds.maxY,
  };
}

function isCircularVisibilityBlocker(entity: ClientEntity): boolean {
  return CIRCULAR_VISIBILITY_BLOCKER_TYPE_IDS.has(entity.typeId);
}
