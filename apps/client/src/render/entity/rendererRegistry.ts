import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { CannonRenderer } from "@client/render/entity/building/CannonRenderer.ts";
import { CraftingStationRenderer } from "@client/render/entity/building/CraftingStationRenderer.ts";
import { LandmineRenderer } from "@client/render/entity/building/LandmineRenderer.ts";
import { WallRenderer } from "@client/render/entity/building/WallRenderer.ts";
import { DrifterRenderer } from "@client/render/entity/enemy/DrifterRenderer.ts";
import { MegaknightRenderer } from "@client/render/entity/enemy/MegaknightRenderer.ts";
import { PoliceRenderer } from "@client/render/entity/enemy/PoliceRenderer.ts";
import { SaboteurRenderer } from "@client/render/entity/enemy/SaboteurRenderer.ts";
import { ShootaRenderer } from "@client/render/entity/enemy/ShootaRenderer.ts";
import { WallbreakerRenderer } from "@client/render/entity/enemy/WallbreakerRenderer.ts";
import { BomberRenderer } from "@client/render/entity/enemy/BomberRenderer.ts";
import type {
  EntityRenderer,
  EntityRendererOptions,
} from "@client/render/entity/EntityRenderer.ts";
import { PickupRenderer } from "@client/render/entity/pickup/PickupRenderer.ts";
import { PlayerRenderer } from "@client/render/entity/player/PlayerRenderer.ts";
import { BasicBulletRenderer } from "@client/render/entity/projectile/BasicBulletRenderer.ts";
import { CannonBulletRenderer } from "@client/render/entity/projectile/CannonBulletRenderer.ts";
import { CrossbowArrowRenderer } from "@client/render/entity/projectile/CrossbowArrowRenderer.ts";
import { HomingDroneRenderer } from "@client/render/entity/projectile/HomingDroneRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type { EntityKind } from "@shared/content/schema.ts";
import { getResourcePath } from "@shared/ids/ResourceId.ts";

type EntityRendererCtor = new (
  pixiRenderer: PixiRenderer,
  options?: EntityRendererOptions,
) => EntityRenderer;

const rendererManifests = [
  ["base", PlayerRenderer],
  ["drifter", DrifterRenderer],
  ["megaknight", MegaknightRenderer],
  ["saboteur", SaboteurRenderer],
  ["shoota", ShootaRenderer],
  ["police", PoliceRenderer],
  ["wallbreaker", WallbreakerRenderer],
  ["bomber", BomberRenderer],
  ["wall", WallRenderer],
  ["cannon", CannonRenderer],
  ["crafting_station", CraftingStationRenderer],
  ["landmine", LandmineRenderer],
  ["basic_bullet", BasicBulletRenderer],
  ["cannon_bullet", CannonBulletRenderer],
  ["crossbow_arrow", CrossbowArrowRenderer],
  ["homing_drone", HomingDroneRenderer],
  ["item_entity", PickupRenderer],
] as const satisfies ReadonlyArray<readonly [string, EntityRendererCtor]>;

const rendererByResourcePath = new Map<string, EntityRendererCtor>(
  rendererManifests,
);

const fallbackRendererByKind: Partial<Record<EntityKind, EntityRendererCtor>> =
  {
    building: CraftingStationRenderer,
    projectile: BasicBulletRenderer,
    pickup: PickupRenderer,
  };

export function createEntityRenderer(
  entity: ClientEntity,
  pixiRenderer: PixiRenderer,
  options: EntityRendererOptions,
): EntityRenderer {
  const resourcePath = getResourcePath(entity.typeId);
  const rendererCtor =
    rendererByResourcePath.get(resourcePath) ??
    fallbackRendererByKind[entity.kind] ??
    PickupRenderer;

  return new rendererCtor(pixiRenderer, options);
}
