import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { createEntityRenderer } from "@client/render/entity/rendererRegistry.ts";
import type {
  EntityRenderer,
  EntityRendererOptions,
} from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";

export class EntityRenderManager {
  private readonly renderers = new Map<number, EntityRenderer>();

  constructor(
    private readonly pixiRenderer: PixiRenderer,
    private readonly options: EntityRendererOptions = {},
  ) {}

  public syncEntity(entity: ClientEntity): void {
    const renderer = this.requireRenderer(entity);
    renderer.sync(entity);
  }

  public update(deltaMs: number, entities: Iterable<ClientEntity>): void {
    for (const entity of entities) {
      const renderer = this.requireRenderer(entity);
      renderer.sync(entity);
      renderer.update(deltaMs, entity);
    }
  }

  public removeEntity(entityId: number): void {
    const renderer = this.renderers.get(entityId);
    if (!renderer) {
      return;
    }

    renderer.destroy();
    this.renderers.delete(entityId);
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
