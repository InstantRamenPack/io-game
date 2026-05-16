import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type {
  EntityRenderer,
  EntityRendererOptions,
} from "@client/render/entity/EntityRenderer.ts";
import { rendererManifests } from "@client/render/entity/generated/rendererRegistry.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import { getResourcePath } from "@shared/ids/ResourceId.ts";

export type EntityRendererCtor = new (
  pixiRenderer: PixiRenderer,
  options?: EntityRendererOptions,
) => EntityRenderer;

const rendererByResourcePath = new Map<string, EntityRendererCtor>(
  rendererManifests,
);

export function getRegisteredEntityRendererResourceNames(): readonly string[] {
  return [...rendererByResourcePath.keys()].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function createEntityRenderer(
  entity: ClientEntity,
  pixiRenderer: PixiRenderer,
  options: EntityRendererOptions,
): EntityRenderer {
  const resourcePath = getResourcePath(entity.typeId);
  const rendererCtor = rendererByResourcePath.get(resourcePath);

  if (!rendererCtor) {
    throw new Error(`Missing entity renderer for ${entity.typeId}.`);
  }

  return new rendererCtor(pixiRenderer, options);
}
