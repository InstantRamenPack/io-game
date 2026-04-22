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
  private readonly presentationByEntityId = new Map<
    number,
    EntityPresentationState
  >();

  constructor(
    private readonly pixiRenderer: PixiRenderer,
    private readonly options: EntityRendererOptions = {},
  ) {}

  public syncEntity(entity: ClientEntity): void {
    if (entity.kind === "player" && !entity.alive) {
      this.removeEntity(entity.id);
      return;
    }
    const renderer = this.requireRenderer(entity);
    renderer.sync(entity, this.presentationByEntityId.get(entity.id));
  }

  public update(deltaMs: number, entities: Iterable<ClientEntity>): void {
    for (const entity of entities) {
      if (entity.kind === "player" && !entity.alive) {
        this.removeEntity(entity.id);
        continue;
      }
      const renderer = this.requireRenderer(entity);
      const presentation = this.presentationByEntityId.get(entity.id);
      renderer.sync(entity, presentation);
      renderer.update(deltaMs, entity, presentation);
    }
  }

  public setPresentationOverride(
    entityId: number,
    presentation: EntityPresentationState | null,
  ): void {
    if (!presentation) {
      this.presentationByEntityId.delete(entityId);
      return;
    }

    this.presentationByEntityId.set(entityId, presentation);
  }

  public removeEntity(entityId: number): void {
    const renderer = this.renderers.get(entityId);
    if (!renderer) {
      return;
    }

    renderer.destroy();
    this.renderers.delete(entityId);
    this.presentationByEntityId.delete(entityId);
  }

  public triggerDamageFlash(entityId: number, durationMs = 150): void {
    this.renderers.get(entityId)?.triggerDamageFlash(durationMs);
  }

  public triggerAttackAnimation(entity: ClientEntity): void {
    this.requireRenderer(entity).playAttackAnimation(entity);
  }

  public destroy(): void {
    for (const renderer of this.renderers.values()) {
      renderer.destroy();
    }
    this.renderers.clear();
    this.presentationByEntityId.clear();
  }

  private requireRenderer(entity: ClientEntity): EntityRenderer {
    let renderer = this.renderers.get(entity.id);
    if (!renderer) {
      renderer = createEntityRenderer(entity, this.pixiRenderer, this.options);
      this.renderers.set(entity.id, renderer);
    }
    return renderer;
  }
}
