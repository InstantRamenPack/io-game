import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { createEntityRenderer } from "@client/render/entity/rendererRegistry.ts";
import type {
  EntityRenderer,
  EntityPresentationState,
  EntityRendererOptions,
} from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";

export class EntityRenderManager {
  private readonly renderers = new Map<number, EntityRenderer>();
  private readonly entitiesById = new Map<number, ClientEntity>();
  private readonly presentationByEntityId = new Map<
    number,
    EntityPresentationState
  >();
  private readonly dirtyEntityIds = new Set<number>();
  private readonly transientActiveEntityIds = new Set<number>();

  constructor(
    private readonly pixiRenderer: PixiRenderer,
    private readonly options: EntityRendererOptions = {},
  ) {}

  public syncEntity(entity: ClientEntity): void {
    if (entity.kind === "player" && !entity.alive) {
      this.removeEntity(entity.id);
      return;
    }
    this.entitiesById.set(entity.id, entity);
    const renderer = this.requireRenderer(entity);
    renderer.sync(entity, this.presentationByEntityId.get(entity.id));
    this.syncTransientActivity(entity.id, renderer);
  }

  public update(deltaMs: number): void {
    // Keep renderer transforms in lock-step with interpolated/predicted entity
    // poses each frame; snapshot sync alone only updates at tick boundaries.
    for (const [entityId, entity] of this.entitiesById) {
      const renderer = this.renderers.get(entityId);
      if (!renderer) {
        continue;
      }
      renderer.sync(entity, this.presentationByEntityId.get(entityId));
      this.syncTransientActivity(entityId, renderer);
    }

    this.dirtyEntityIds.clear();

    for (const entityId of [...this.transientActiveEntityIds]) {
      const entity = this.entitiesById.get(entityId);
      const renderer = this.renderers.get(entityId);
      if (!entity || !renderer) {
        this.transientActiveEntityIds.delete(entityId);
        continue;
      }

      renderer.update(
        deltaMs,
        entity,
        this.presentationByEntityId.get(entityId),
      );
      this.syncTransientActivity(entityId, renderer);
    }
  }

  public setPresentationOverride(
    entityId: number,
    presentation: EntityPresentationState | null,
  ): void {
    const hadPresentation = this.presentationByEntityId.has(entityId);
    if (!presentation) {
      this.presentationByEntityId.delete(entityId);
      if (hadPresentation) {
        this.dirtyEntityIds.add(entityId);
      }
      return;
    }

    this.presentationByEntityId.set(entityId, presentation);
    this.dirtyEntityIds.add(entityId);
  }

  public removeEntity(entityId: number): void {
    const renderer = this.renderers.get(entityId);
    if (!renderer) {
      this.entitiesById.delete(entityId);
      this.dirtyEntityIds.delete(entityId);
      this.transientActiveEntityIds.delete(entityId);
      this.presentationByEntityId.delete(entityId);
      return;
    }

    renderer.destroy();
    this.renderers.delete(entityId);
    this.entitiesById.delete(entityId);
    this.presentationByEntityId.delete(entityId);
    this.dirtyEntityIds.delete(entityId);
    this.transientActiveEntityIds.delete(entityId);
  }

  public triggerDamageFlash(entityId: number, durationMs = 150): void {
    const renderer = this.renderers.get(entityId);
    if (!renderer) {
      return;
    }
    renderer.triggerDamageFlash(durationMs);
    this.syncTransientActivity(entityId, renderer);
  }

  public triggerAttackAnimation(entity: ClientEntity): void {
    this.entitiesById.set(entity.id, entity);
    const renderer = this.requireRenderer(entity);
    renderer.playAttackAnimation(entity);
    this.syncTransientActivity(entity.id, renderer);
  }

  public destroy(): void {
    for (const renderer of this.renderers.values()) {
      renderer.destroy();
    }
    this.renderers.clear();
    this.entitiesById.clear();
    this.presentationByEntityId.clear();
    this.dirtyEntityIds.clear();
    this.transientActiveEntityIds.clear();
  }

  private requireRenderer(entity: ClientEntity): EntityRenderer {
    let renderer = this.renderers.get(entity.id);
    if (!renderer) {
      renderer = createEntityRenderer(entity, this.pixiRenderer, this.options);
      this.renderers.set(entity.id, renderer);
    }
    return renderer;
  }

  private syncTransientActivity(
    entityId: number,
    renderer: EntityRenderer,
  ): void {
    if (
      hasTransientAnimationState(renderer) &&
      renderer.hasTransientAnimation()
    ) {
      this.transientActiveEntityIds.add(entityId);
      return;
    }
    this.transientActiveEntityIds.delete(entityId);
  }
}

type EntityRendererWithTransientState = EntityRenderer & {
  hasTransientAnimation(): boolean;
};

function hasTransientAnimationState(
  renderer: EntityRenderer,
): renderer is EntityRendererWithTransientState {
  return (
    typeof (renderer as EntityRendererWithTransientState)
      .hasTransientAnimation === "function"
  );
}
