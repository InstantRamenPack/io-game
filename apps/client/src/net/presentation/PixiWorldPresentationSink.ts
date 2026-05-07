import type { ClientWorld } from "@client/net/ClientWorld.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { WorldPresentationEvent } from "@client/net/presentation/WorldPresentationEvent.ts";
import { EntityRenderManager } from "@client/render/EntityRenderManager.ts";
import type { EntityPresentationState } from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type { VisibilityBlockerShape } from "@client/render/renderTypes.ts";

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
        this.renderManager.triggerAttackAnimationByEntityId(event.payload.sourceId);
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
    const playerX = this.renderer.playerX;
    const playerY = this.renderer.playerY;
    if (playerX === undefined || playerY === undefined) {
      this.renderer.setVisibilityBlockers([]);
      return;
    }

    const candidates: Array<{
      blocker: VisibilityBlockerShape;
      distanceSq: number;
    }> = [];

    for (const entity of world.entities.values()) {
      if (!isVisibilityBlockerEntity(entity)) {
        continue;
      }
      const blocker = toVisibilityBlocker(entity);
      if (!blocker) {
        continue;
      }
      const center = getVisibilityBlockerCenter(blocker);
      const dx = center.x - playerX;
      const dy = center.y - playerY;
      candidates.push({ blocker, distanceSq: dx * dx + dy * dy });
    }

    candidates.sort((left, right) => left.distanceSq - right.distanceSq);
    this.renderer.setVisibilityBlockers(candidates.map(({ blocker }) => blocker));
  }
}

function isVisibilityBlockerEntity(entity: ClientEntity): boolean {
  if (!entity.alive) {
    return false;
  }
  return entity.kind === "building" || entity.kind === "structure";
}

function toVisibilityBlocker(entity: ClientEntity): VisibilityBlockerShape | null {
  const bounds = entity.hitboxBounds;
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  if (isCircularVisibilityBlocker(entity)) {
    const radius =
      Math.max(bounds.width, bounds.height) * 0.5 * 0.7;
    return {
      kind: "circle",
      centerX: entity.x + bounds.centerX,
      centerY: entity.y + bounds.centerY,
      radius,
    };
  }

  return {
    kind: "rect",
    minX: entity.x + bounds.minX,
    minY: entity.y + bounds.minY,
    maxX: entity.x + bounds.maxX,
    maxY: entity.y + bounds.maxY,
  };
}

function isCircularVisibilityBlocker(entity: ClientEntity): boolean {
  return entity.typeId.endsWith(":tree");
}

function getVisibilityBlockerCenter(
  blocker: VisibilityBlockerShape,
): { x: number; y: number } {
  if (blocker.kind === "circle") {
    return { x: blocker.centerX, y: blocker.centerY };
  }
  return {
    x: (blocker.minX + blocker.maxX) / 2,
    y: (blocker.minY + blocker.maxY) / 2,
  };
}
