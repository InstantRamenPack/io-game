import type { ClientWorld } from "@client/net/ClientWorld.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { WorldPresentationEvent } from "@client/net/presentation/WorldPresentationEvent.ts";
import { EntityRenderManager } from "@client/render/EntityRenderManager.ts";
import type { EntityPresentationState } from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type { VisibilityBlockerShape } from "@client/render/renderTypes.ts";
import {
  getEntityContent,
  getVisibilityBlockerContent,
} from "@shared/content/catalog.ts";
import { getTreeCanopyRadiusFromHitboxWidth } from "@shared/content/structure/treeVisual.ts";
import { resolveHitboxRects } from "@shared/geometry/hitbox.ts";

export class PixiWorldPresentationSink {
  private readonly renderManager: EntityRenderManager;
  private readonly syncedEntityIds = new Set<number>();
  private readonly statusEffectParticleCooldownMs = new Map<string, number>();

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
    this.statusEffectParticleCooldownMs.clear();
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
    this.updateStatusEffectParticles(world, deltaMs);
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

      if (event.type === "wither_beam") {
        this.renderer.triggerWitherBeamEffect(
          event.payload.x,
          event.payload.y,
          event.payload.angle,
          event.payload.length,
          event.payload.width,
        );
        continue;
      }

      if (event.type === "wither_airstrike_warning") {
        this.renderer.triggerAirstrikeWarning(
          event.payload.x,
          event.payload.y,
          event.payload.radius,
          event.payload.warningTicks,
        );
        continue;
      }

      if (event.type !== "damage") {
        continue;
      }

      if (
        event.payload.isFatal &&
        event.payload.targetTypeId === "structure:crate"
      ) {
        this.renderer.triggerCrateBreakEffect(event.payload.x, event.payload.y);
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

  private updateStatusEffectParticles(
    world: ClientWorld,
    deltaMs: number,
  ): void {
    const liveKeys = new Set<string>();
    for (const entity of world.entities.values()) {
      if (!entity.alive || entity.kind !== "player" || !entity.activeEffects) {
        continue;
      }
      for (const effect of entity.activeEffects) {
        const key = `${entity.id}:${effect.typeId}`;
        liveKeys.add(key);
        const nextCooldown =
          (this.statusEffectParticleCooldownMs.get(key) ?? 0) - deltaMs;
        if (nextCooldown > 0) {
          this.statusEffectParticleCooldownMs.set(key, nextCooldown);
          continue;
        }
        this.statusEffectParticleCooldownMs.set(key, 180);
        this.renderer.triggerStatusEffect(
          effect.typeId,
          entity.x,
          entity.y,
          Math.max(entity.hitboxBounds.width, entity.hitboxBounds.height) / 2,
        );
      }
    }

    for (const key of this.statusEffectParticleCooldownMs.keys()) {
      if (!liveKeys.has(key)) {
        this.statusEffectParticleCooldownMs.delete(key);
      }
    }
  }

  private updateVisibility(world: ClientWorld): void {
    if (
      this.renderer.playerX === undefined ||
      this.renderer.playerY === undefined
    ) {
      this.renderer.setLightsOutSuppressed(false);
      this.renderer.setVisibilityBlockers([]);
      return;
    }

    const player =
      this.renderer.playerEntityId === undefined
        ? undefined
        : world.entities.get(this.renderer.playerEntityId);
    this.renderer.setLightsOutSuppressed(
      player?.name?.toLowerCase() === "debug",
    );

    const blockers: VisibilityBlockerShape[] = [];

    for (const entity of world.entities.values()) {
      if (!isVisibilityBlockerEntity(entity)) {
        continue;
      }
      const blocker = toVisibilityBlocker(entity);
      if (blocker) {
        blockers.push(blocker);
      }
    }

    this.renderer.setVisibilityBlockers(blockers);
  }
}

function isVisibilityBlockerEntity(entity: ClientEntity): boolean {
  if (!entity.alive) {
    return false;
  }
  const blockerContent = getVisibilityBlockerContent(entity.typeId);
  if (blockerContent?.mode === "none") {
    return false;
  }
  if (blockerContent !== undefined) {
    return true;
  }

  return (
    (entity.kind === "building" ||
      entity.kind === "tower" ||
      entity.kind === "structure") &&
    getEntityContent(entity.typeId)?.collisionMode === "static"
  );
}

export function toVisibilityBlocker(
  entity: ClientEntity,
): VisibilityBlockerShape | null {
  const blockerContent = getVisibilityBlockerContent(entity.typeId);
  if (blockerContent?.mode === "none") {
    return null;
  }
  if (
    blockerContent === undefined &&
    getEntityContent(entity.typeId)?.collisionMode !== "static"
  ) {
    return null;
  }

  const bounds = entity.hitboxBounds;
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const circleRadius = getCircleVisibilityRadius(entity);
  if (circleRadius !== null) {
    return {
      kind: "circle",
      sourceEntityId: entity.id,
      centerX: entity.x + bounds.centerX,
      centerY: entity.y + bounds.centerY,
      radius: circleRadius,
    };
  }

  return {
    kind: "rects",
    sourceEntityId: entity.id,
    rects: resolveHitboxRects(entity.x, entity.y, entity.hitboxes).map(
      (rect) => ({
        minX: rect.minX,
        minY: rect.minY,
        maxX: rect.maxX,
        maxY: rect.maxY,
      }),
    ),
  };
}

function getCircleVisibilityRadius(entity: ClientEntity): number | null {
  const blockerContent = getVisibilityBlockerContent(entity.typeId);
  if (blockerContent?.mode === "circle") {
    if (entity.typeId === "structure:tree") {
      return getTreeCanopyRadiusFromHitboxWidth(entity.hitboxBounds.width);
    }
    return blockerContent.radius;
  }
  return null;
}
