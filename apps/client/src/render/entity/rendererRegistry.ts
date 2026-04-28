import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { CannonRenderer } from "@client/render/entity/building/CannonRenderer.ts";
import { ChestRenderer } from "@client/render/entity/building/ChestRenderer.ts";
import { CraftingStationRenderer } from "@client/render/entity/building/CraftingStationRenderer.ts";
import { FenceRenderer } from "@client/render/entity/building/FenceRenderer.ts";
import { LandmineRenderer } from "@client/render/entity/building/LandmineRenderer.ts";
import { MapBuildingRenderer } from "@client/render/entity/building/MapBuildingRenderer.ts";
import { TentRenderer } from "@client/render/entity/building/TentRenderer.ts";
import { TreeRenderer } from "@client/render/entity/building/TreeRenderer.ts";
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
  ["tree", TreeRenderer],
  ["house_xl", MapBuildingRenderer],
  ["house_l", MapBuildingRenderer],
  ["house_m", MapBuildingRenderer],
  ["fence_h", FenceRenderer],
  ["fence_v", FenceRenderer],
  ["tent", TentRenderer],
  ["wall", WallRenderer],
  ["dungeon_wall", WallRenderer],
  ["cannon", CannonRenderer],
  ["chest", ChestRenderer],
  ["crafting_station", CraftingStationRenderer],
  ["landmine", LandmineRenderer],
  ["basic_bullet", BasicBulletRenderer],
  ["rifle_bullet", BasicBulletRenderer],
  ["sniper_bullet", BasicBulletRenderer],
  ["cannon_bullet", CannonBulletRenderer],
  ["crossbow_arrow", CrossbowArrowRenderer],
  ["homing_drone", HomingDroneRenderer],
  ["item_entity", PickupRenderer],
] as const satisfies ReadonlyArray<readonly [string, EntityRendererCtor]>;

const rendererByResourcePath = new Map<string, EntityRendererCtor>(
  rendererManifests,
);

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
