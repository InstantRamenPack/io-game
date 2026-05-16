import { CannonRenderer } from "@client/render/entity/building/CannonRenderer.ts";
import { ChestRenderer } from "@client/render/entity/building/ChestRenderer.ts";
import { CommsTowerRenderer } from "@client/render/entity/building/CommsTowerRenderer.ts";
import { CraftingStationRenderer } from "@client/render/entity/building/CraftingStationRenderer.ts";
import { DungeonRenderer } from "@client/render/entity/building/DungeonRenderer.ts";
import { EnergyTowerRenderer } from "@client/render/entity/building/EnergyTowerRenderer.ts";
import { FenceRenderer } from "@client/render/entity/building/FenceRenderer.ts";
import { LandmineRenderer } from "@client/render/entity/building/LandmineRenderer.ts";
import { MapBuildingRenderer } from "@client/render/entity/building/MapBuildingRenderer.ts";
import { RecyclerRenderer } from "@client/render/entity/building/RecyclerRenderer.ts";
import { TreeRenderer } from "@client/render/entity/building/TreeRenderer.ts";
import { TripwireRenderer } from "@client/render/entity/building/TripwireRenderer.ts";
import { WallRenderer } from "@client/render/entity/building/WallRenderer.ts";
import { BomberRenderer } from "@client/render/entity/enemy/BomberRenderer.ts";
import { CommanderRenderer } from "@client/render/entity/enemy/CommanderRenderer.ts";
import { CrateRenderer } from "@client/render/entity/enemy/CrateRenderer.ts";
import { DrifterRenderer } from "@client/render/entity/enemy/DrifterRenderer.ts";
import { MegaknightRenderer } from "@client/render/entity/enemy/MegaknightRenderer.ts";
import { PoliceRenderer } from "@client/render/entity/enemy/PoliceRenderer.ts";
import { SaboteurRenderer } from "@client/render/entity/enemy/SaboteurRenderer.ts";
import { ShootaRenderer } from "@client/render/entity/enemy/ShootaRenderer.ts";
import { SniperEnemyRenderer } from "@client/render/entity/enemy/SniperEnemyRenderer.ts";
import { StalkerRenderer } from "@client/render/entity/enemy/StalkerRenderer.ts";
import { ThanosRenderer } from "@client/render/entity/enemy/ThanosRenderer.ts";
import { WallbreakerRenderer } from "@client/render/entity/enemy/WallbreakerRenderer.ts";
import { PickupRenderer } from "@client/render/entity/pickup/PickupRenderer.ts";
import { PlayerRenderer } from "@client/render/entity/player/PlayerRenderer.ts";
import { BasicBulletRenderer } from "@client/render/entity/projectile/BasicBulletRenderer.ts";
import { CannonBulletRenderer } from "@client/render/entity/projectile/CannonBulletRenderer.ts";
import { CrossbowArrowRenderer } from "@client/render/entity/projectile/CrossbowArrowRenderer.ts";
import { HomingDroneRenderer } from "@client/render/entity/projectile/HomingDroneRenderer.ts";
import { ThanosBulletRenderer } from "@client/render/entity/projectile/ThanosBulletRenderer.ts";
import { ThanosRocketRenderer } from "@client/render/entity/projectile/ThanosRocketRenderer.ts";

import { getEntityRendererRegistryManifest } from "@shared/content/catalog.ts";
import { getResourcePath } from "@shared/ids/ResourceId.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type {
  EntityRenderer,
  EntityRendererOptions,
} from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";

export type EntityRendererCtor = new (
  pixiRenderer: PixiRenderer,
  options?: EntityRendererOptions,
) => EntityRenderer;

type EntityRendererBySymbol = Readonly<Record<string, EntityRendererCtor>>;

const rendererBySymbol: EntityRendererBySymbol = {
  CannonRenderer,
  ChestRenderer,
  CommsTowerRenderer,
  CraftingStationRenderer,
  DungeonRenderer,
  EnergyTowerRenderer,
  FenceRenderer,
  LandmineRenderer,
  MapBuildingRenderer,
  RecyclerRenderer,
  TreeRenderer,
  TripwireRenderer,
  WallRenderer,
  BomberRenderer,
  CommanderRenderer,
  CrateRenderer,
  DrifterRenderer,
  MegaknightRenderer,
  PoliceRenderer,
  SaboteurRenderer,
  ShootaRenderer,
  SniperEnemyRenderer,
  StalkerRenderer,
  ThanosRenderer,
  WallbreakerRenderer,
  PickupRenderer,
  PlayerRenderer,
  BasicBulletRenderer,
  CannonBulletRenderer,
  CrossbowArrowRenderer,
  HomingDroneRenderer,
  ThanosBulletRenderer,
  ThanosRocketRenderer,
};

const rendererByResourcePath = new Map<string, EntityRendererCtor>(
  getEntityRendererRegistryManifest().entityRenderers.map((entry) => {
    const rendererCtor = rendererBySymbol[entry.symbol];
    if (!rendererCtor) {
      throw new Error(`Unknown entity renderer symbol ${entry.symbol}.`);
    }
    return [entry.resourceName, rendererCtor] as const;
  }),
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
