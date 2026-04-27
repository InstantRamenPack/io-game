import { makeResourceId, type ResourceId } from "@shared/ids/ResourceId.ts";
import { Building } from "@server/entities/Building.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { entityTypeRegistry } from "@server/registry/registries.ts";
import { isSpawnableEntityCtor } from "@server/runtime/ctorGuards.ts";
import type { World } from "@server/world/World.ts";

const BUILDING_XL_TYPE_ID = makeResourceId("building", "building_xl");
const BUILDING_L_TYPE_ID = makeResourceId("building", "building_l");
const BUILDING_M_TYPE_ID = makeResourceId("building", "building_m");
const FENCE_H_TYPE_ID = makeResourceId("building", "fence_h");
const FENCE_V_TYPE_ID = makeResourceId("building", "fence_v");
const TENT_TYPE_ID = makeResourceId("building", "tent");
const TREE_TYPE_ID = makeResourceId("building", "tree");
const DRIFTER_TYPE_ID = makeResourceId("enemy", "drifter");
const SHOOTA_TYPE_ID = makeResourceId("enemy", "shoota");
const POLICE_TYPE_ID = makeResourceId("enemy", "police");

type MapSpawnSpec = {
  typeId: ResourceId;
  x: number;
  y: number;
  label?: string;
};

// ---------------------------------------------------------------------------
// Military Base  (zone: x 300-2700, y 300-2700)
// fence_h entities cover 400 units horizontally; fence_v cover 400 vertically
// ---------------------------------------------------------------------------
const MILITARY_STRUCTURES: MapSpawnSpec[] = [
  // Perimeter — top row (y=300)
  { typeId: FENCE_H_TYPE_ID, x: 500, y: 300 },
  { typeId: FENCE_H_TYPE_ID, x: 900, y: 300 },
  { typeId: FENCE_H_TYPE_ID, x: 1300, y: 300 },
  { typeId: FENCE_H_TYPE_ID, x: 1700, y: 300 },
  { typeId: FENCE_H_TYPE_ID, x: 2100, y: 300 },
  { typeId: FENCE_H_TYPE_ID, x: 2500, y: 300 },

  // Perimeter — south row (y=2700), gate gap at x 1100-1900
  { typeId: FENCE_H_TYPE_ID, x: 500, y: 2700 },
  { typeId: FENCE_H_TYPE_ID, x: 900, y: 2700 },
  { typeId: FENCE_H_TYPE_ID, x: 2100, y: 2700 },
  { typeId: FENCE_H_TYPE_ID, x: 2500, y: 2700 },

  // Perimeter — left col (x=300)
  { typeId: FENCE_V_TYPE_ID, x: 300, y: 500 },
  { typeId: FENCE_V_TYPE_ID, x: 300, y: 900 },
  { typeId: FENCE_V_TYPE_ID, x: 300, y: 1300 },
  { typeId: FENCE_V_TYPE_ID, x: 300, y: 1700 },
  { typeId: FENCE_V_TYPE_ID, x: 300, y: 2100 },
  { typeId: FENCE_V_TYPE_ID, x: 300, y: 2500 },

  // Perimeter — right col (x=2700)
  { typeId: FENCE_V_TYPE_ID, x: 2700, y: 500 },
  { typeId: FENCE_V_TYPE_ID, x: 2700, y: 900 },
  { typeId: FENCE_V_TYPE_ID, x: 2700, y: 1300 },
  { typeId: FENCE_V_TYPE_ID, x: 2700, y: 1700 },
  { typeId: FENCE_V_TYPE_ID, x: 2700, y: 2100 },
  { typeId: FENCE_V_TYPE_ID, x: 2700, y: 2500 },

  // Corner guard towers (moved inward enough that building edges clear the fence lines)
  { typeId: BUILDING_M_TYPE_ID, x: 530, y: 480, label: "Guard Tower" },
  { typeId: BUILDING_M_TYPE_ID, x: 2470, y: 480, label: "Guard Tower" },
  { typeId: BUILDING_M_TYPE_ID, x: 530, y: 2520, label: "Guard Tower" },
  { typeId: BUILDING_M_TYPE_ID, x: 2470, y: 2520, label: "Guard Tower" },

  // Main buildings
  { typeId: BUILDING_XL_TYPE_ID, x: 1500, y: 1100, label: "Command Center" },
  { typeId: BUILDING_L_TYPE_ID, x: 700, y: 850, label: "Barracks" },
  { typeId: BUILDING_L_TYPE_ID, x: 2300, y: 850, label: "Barracks" },
  { typeId: BUILDING_L_TYPE_ID, x: 700, y: 1950, label: "Armory" },
  { typeId: BUILDING_L_TYPE_ID, x: 2300, y: 1950, label: "Vehicle Bay" },

  // Internal rocks / obstacles
  { typeId: BUILDING_M_TYPE_ID, x: 1500, y: 2200, label: "Watchtower" },
];

const MILITARY_ENEMIES: MapSpawnSpec[] = [
  { typeId: DRIFTER_TYPE_ID, x: 1100, y: 1500 },
  { typeId: DRIFTER_TYPE_ID, x: 1900, y: 1500 },
  { typeId: DRIFTER_TYPE_ID, x: 1500, y: 700 },
  { typeId: DRIFTER_TYPE_ID, x: 800, y: 1400 },
  { typeId: DRIFTER_TYPE_ID, x: 2200, y: 1400 },
  { typeId: DRIFTER_TYPE_ID, x: 1500, y: 1800 },
  { typeId: SHOOTA_TYPE_ID, x: 1100, y: 800 },
  { typeId: SHOOTA_TYPE_ID, x: 1900, y: 800 },
  { typeId: SHOOTA_TYPE_ID, x: 700, y: 2200 },
  { typeId: SHOOTA_TYPE_ID, x: 2300, y: 2200 },
  { typeId: POLICE_TYPE_ID, x: 1500, y: 1500 },
  { typeId: POLICE_TYPE_ID, x: 900, y: 2000 },
];

// ---------------------------------------------------------------------------
// Extraction Zone  (zone: x 350-1800, y 3300-4800)
// ---------------------------------------------------------------------------
const EXTRACTION_STRUCTURES: MapSpawnSpec[] = [
  // Perimeter fences (loose, open feel)
  { typeId: FENCE_H_TYPE_ID, x: 750, y: 3350 },
  { typeId: FENCE_H_TYPE_ID, x: 1350, y: 3350 },
  { typeId: FENCE_H_TYPE_ID, x: 750, y: 4750 },
  { typeId: FENCE_H_TYPE_ID, x: 1350, y: 4750 },
  { typeId: FENCE_V_TYPE_ID, x: 400, y: 3750 },
  { typeId: FENCE_V_TYPE_ID, x: 400, y: 4300 },
  // East side open (entrance from military side left unblocked)
  { typeId: FENCE_V_TYPE_ID, x: 1750, y: 3750 },
  { typeId: FENCE_V_TYPE_ID, x: 1750, y: 4300 },

  // Control booth (moved left to clear fence_v at x=1750)
  { typeId: BUILDING_M_TYPE_ID, x: 1400, y: 3600, label: "Control Booth" },
];

// No enemies at extraction zone (safe area)

// ---------------------------------------------------------------------------
// Abandoned Village  (zone: x 3200-6500, y 250-2500)
// ---------------------------------------------------------------------------
const VILLAGE_STRUCTURES: MapSpawnSpec[] = [
  { typeId: BUILDING_M_TYPE_ID, x: 3600, y: 650, label: "House" },
  { typeId: BUILDING_M_TYPE_ID, x: 4050, y: 900, label: "House" },
  { typeId: BUILDING_M_TYPE_ID, x: 3700, y: 1400, label: "House" },
  { typeId: BUILDING_L_TYPE_ID, x: 3550, y: 2000, label: "Farm" },
  { typeId: BUILDING_M_TYPE_ID, x: 4800, y: 700, label: "Blacksmith" },
  { typeId: BUILDING_M_TYPE_ID, x: 5400, y: 1100, label: "Clinic" },
  // Extra buildings in bottom corners of village
  { typeId: BUILDING_M_TYPE_ID, x: 4100, y: 2300, label: "House" },
  { typeId: BUILDING_L_TYPE_ID, x: 5800, y: 2000, label: "Warehouse" },
  // Scattered fence fragments (ruined village feel) — shifted clear of buildings
  { typeId: FENCE_H_TYPE_ID, x: 3900, y: 1200 },
  { typeId: FENCE_V_TYPE_ID, x: 4300, y: 1600 },
  { typeId: FENCE_H_TYPE_ID, x: 5200, y: 1300 },
];

const VILLAGE_ENEMIES: MapSpawnSpec[] = [
  { typeId: DRIFTER_TYPE_ID, x: 4200, y: 1300 },
  { typeId: DRIFTER_TYPE_ID, x: 3900, y: 700 },
  { typeId: DRIFTER_TYPE_ID, x: 5000, y: 1500 },
];

// ---------------------------------------------------------------------------
// Outpost  (zone: x 3200-6100, y 4800-6700)
// ---------------------------------------------------------------------------
const OUTPOST_STRUCTURES: MapSpawnSpec[] = [
  { typeId: TENT_TYPE_ID, x: 3550, y: 5200 },
  { typeId: TENT_TYPE_ID, x: 3900, y: 5550 },
  { typeId: TENT_TYPE_ID, x: 4300, y: 5100 },
  { typeId: TENT_TYPE_ID, x: 4700, y: 5500 },
  { typeId: TENT_TYPE_ID, x: 5100, y: 5200 },
  { typeId: TENT_TYPE_ID, x: 5500, y: 5600 },
  { typeId: TENT_TYPE_ID, x: 5800, y: 5050 },
  { typeId: TENT_TYPE_ID, x: 6000, y: 5450 },
  { typeId: BUILDING_M_TYPE_ID, x: 4750, y: 5900, label: "Watchtower" },
  { typeId: BUILDING_M_TYPE_ID, x: 4300, y: 5900, label: "Supply Cache" },
  // Fence fragments (ruined perimeter)
  { typeId: FENCE_H_TYPE_ID, x: 3700, y: 4950 },
  { typeId: FENCE_H_TYPE_ID, x: 4900, y: 4950 },
  { typeId: FENCE_V_TYPE_ID, x: 3300, y: 5500 },
  { typeId: FENCE_V_TYPE_ID, x: 6200, y: 5300 },
];

const OUTPOST_ENEMIES: MapSpawnSpec[] = [
  { typeId: DRIFTER_TYPE_ID, x: 4000, y: 5350 },
  { typeId: DRIFTER_TYPE_ID, x: 4600, y: 5200 },
  { typeId: DRIFTER_TYPE_ID, x: 5300, y: 5700 },
  { typeId: DRIFTER_TYPE_ID, x: 5700, y: 5200 },
  { typeId: SHOOTA_TYPE_ID, x: 4800, y: 6100 },
  { typeId: SHOOTA_TYPE_ID, x: 5200, y: 5500 },
  { typeId: SHOOTA_TYPE_ID, x: 3800, y: 5800 },
];

// ---------------------------------------------------------------------------
// Forest  (zone: x 7000-9800, y 200-6800)
// 75 trees in clusters leaving navigable corridors
// ---------------------------------------------------------------------------
const FOREST_TREES: { x: number; y: number }[] = [
  // Top cluster
  { x: 7150, y: 420 },
  { x: 7400, y: 620 },
  { x: 7700, y: 470 },
  { x: 7950, y: 720 },
  { x: 8200, y: 420 },
  { x: 8500, y: 680 },
  { x: 7300, y: 920 },
  { x: 7650, y: 1100 },
  { x: 7900, y: 960 },
  { x: 8150, y: 1200 },
  { x: 8450, y: 870 },
  { x: 9050, y: 530 },
  { x: 9300, y: 820 },
  { x: 9580, y: 440 },
  { x: 9200, y: 1120 },
  { x: 7100, y: 1450 },
  { x: 7450, y: 1620 },
  { x: 7800, y: 1480 },
  { x: 8100, y: 1720 },
  { x: 8500, y: 1380 },
  { x: 9480, y: 1540 },

  // Mid cluster
  { x: 7200, y: 2420 },
  { x: 7520, y: 2720 },
  { x: 7900, y: 2520 },
  { x: 8230, y: 2820 },
  { x: 8620, y: 2430 },
  { x: 9120, y: 2620 },
  { x: 9420, y: 2920 },
  { x: 9680, y: 2540 },
  { x: 7120, y: 3220 },
  { x: 7460, y: 3420 },
  { x: 7760, y: 3120 },
  { x: 8020, y: 3520 },
  { x: 8420, y: 3230 },
  { x: 8780, y: 3580 },
  { x: 9220, y: 3320 },
  { x: 9520, y: 3720 },
  { x: 7330, y: 3920 },
  { x: 7720, y: 4120 },
  { x: 8120, y: 3830 },
  { x: 8520, y: 4230 },
  { x: 8920, y: 3940 },
  { x: 9150, y: 4320 },
  { x: 9620, y: 4130 },
  { x: 7630, y: 4520 },
  { x: 8320, y: 4620 },
  { x: 9030, y: 4530 },
  { x: 8720, y: 4830 },
  { x: 7430, y: 4940 },
  { x: 9230, y: 4730 },
  { x: 7130, y: 4230 },

  // Bottom cluster
  { x: 7220, y: 5130 },
  { x: 7620, y: 5330 },
  { x: 8020, y: 5030 },
  { x: 8430, y: 5430 },
  { x: 8830, y: 5130 },
  { x: 9330, y: 5230 },
  { x: 9630, y: 5630 },
  { x: 7320, y: 5830 },
  { x: 7730, y: 6030 },
  { x: 8130, y: 5730 },
  { x: 8530, y: 6130 },
  { x: 8930, y: 5830 },
  { x: 9230, y: 6030 },
  { x: 9520, y: 6430 },
  { x: 7130, y: 6250 },
  { x: 7530, y: 6530 },
  { x: 8230, y: 6330 },
  { x: 8730, y: 6630 },
  { x: 9130, y: 6430 },
  { x: 7930, y: 6630 },
  { x: 9680, y: 5930 },
];

function spawnMapEntity(world: World, spec: MapSpawnSpec): void {
  const entry = entityTypeRegistry.require(spec.typeId);
  if (!isSpawnableEntityCtor(entry.ctor)) {
    throw new Error(`Map spawn type ${spec.typeId} is not spawnable.`);
  }

  const entityId = world.allocEntityId();
  const entity: Entity = new entry.ctor(entityId);

  entity.x = spec.x;
  entity.y = spec.y;

  if (entity instanceof Building) {
    if (spec.label) {
      entity.label = spec.label;
    }
    entity.hp = 0;
    entity.maxHp = 0;
  }

  world.spawn(entity);
}

/**
 * Spawns all static map structures and initial enemies into the world.
 * Call once during server initialization after bootstrapTypeRegistries().
 */
export function loadMap(world: World): void {
  for (const spec of MILITARY_STRUCTURES) {
    spawnMapEntity(world, spec);
  }
  for (const spec of EXTRACTION_STRUCTURES) {
    spawnMapEntity(world, spec);
  }
  for (const spec of VILLAGE_STRUCTURES) {
    spawnMapEntity(world, spec);
  }
  for (const spec of OUTPOST_STRUCTURES) {
    spawnMapEntity(world, spec);
  }
  for (const pos of FOREST_TREES) {
    spawnMapEntity(world, { typeId: TREE_TYPE_ID, x: pos.x, y: pos.y });
  }
  for (const spec of MILITARY_ENEMIES) {
    spawnMapEntity(world, spec);
  }
  for (const spec of VILLAGE_ENEMIES) {
    spawnMapEntity(world, spec);
  }
  for (const spec of OUTPOST_ENEMIES) {
    spawnMapEntity(world, spec);
  }
}
