import { BuildingL } from "@server/entities/buildings/BuildingL.ts";
import { BuildingM } from "@server/entities/buildings/BuildingM.ts";
import { BuildingXl } from "@server/entities/buildings/BuildingXl.ts";
import { FenceH } from "@server/entities/buildings/FenceH.ts";
import { FenceV } from "@server/entities/buildings/FenceV.ts";
import { Tent } from "@server/entities/buildings/Tent.ts";
import { Tree } from "@server/entities/buildings/Tree.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import type { Building } from "@server/entities/Building.ts";
import type { World } from "@server/world/World.ts";

type BuildingSpec =
  | { type: "xl"; x: number; y: number; label: string }
  | { type: "l"; x: number; y: number; label: string }
  | { type: "m"; x: number; y: number; label: string }
  | { type: "fence_h"; x: number; y: number }
  | { type: "fence_v"; x: number; y: number }
  | { type: "tent"; x: number; y: number }
  | { type: "tree"; x: number; y: number };

type EnemySpec =
  | { kind: "drifter"; x: number; y: number }
  | { kind: "shoota"; x: number; y: number }
  | { kind: "police"; x: number; y: number };

// ---------------------------------------------------------------------------
// Military Base  (zone: x 300-2700, y 300-2700)
// fence_h entities cover 400 units horizontally; fence_v cover 400 vertically
// ---------------------------------------------------------------------------
const MILITARY_STRUCTURES: BuildingSpec[] = [
  // Perimeter — top row (y=300)
  { type: "fence_h", x: 500, y: 300 },
  { type: "fence_h", x: 900, y: 300 },
  { type: "fence_h", x: 1300, y: 300 },
  { type: "fence_h", x: 1700, y: 300 },
  { type: "fence_h", x: 2100, y: 300 },
  { type: "fence_h", x: 2500, y: 300 },

  // Perimeter — south row (y=2700), gate gap at x 1100-1900
  { type: "fence_h", x: 500, y: 2700 },
  { type: "fence_h", x: 900, y: 2700 },
  { type: "fence_h", x: 2100, y: 2700 },
  { type: "fence_h", x: 2500, y: 2700 },

  // Perimeter — left col (x=300)
  { type: "fence_v", x: 300, y: 500 },
  { type: "fence_v", x: 300, y: 900 },
  { type: "fence_v", x: 300, y: 1300 },
  { type: "fence_v", x: 300, y: 1700 },
  { type: "fence_v", x: 300, y: 2100 },
  { type: "fence_v", x: 300, y: 2500 },

  // Perimeter — right col (x=2700)
  { type: "fence_v", x: 2700, y: 500 },
  { type: "fence_v", x: 2700, y: 900 },
  { type: "fence_v", x: 2700, y: 1300 },
  { type: "fence_v", x: 2700, y: 1700 },
  { type: "fence_v", x: 2700, y: 2100 },
  { type: "fence_v", x: 2700, y: 2500 },

  // Corner guard towers
  { type: "m", x: 420, y: 420, label: "Guard Tower" },
  { type: "m", x: 2580, y: 420, label: "Guard Tower" },
  { type: "m", x: 420, y: 2580, label: "Guard Tower" },
  { type: "m", x: 2580, y: 2580, label: "Guard Tower" },

  // Main buildings
  { type: "xl", x: 1500, y: 1100, label: "Command Center" },
  { type: "l", x: 700, y: 850, label: "Barracks" },
  { type: "l", x: 2300, y: 850, label: "Barracks" },
  { type: "l", x: 700, y: 1950, label: "Armory" },
  { type: "l", x: 2300, y: 1950, label: "Vehicle Bay" },

  // Internal rocks / obstacles
  { type: "m", x: 1500, y: 2200, label: "Watchtower" },
];

const MILITARY_ENEMIES: EnemySpec[] = [
  { kind: "drifter", x: 1100, y: 1500 },
  { kind: "drifter", x: 1900, y: 1500 },
  { kind: "drifter", x: 1500, y: 700 },
  { kind: "drifter", x: 800, y: 1400 },
  { kind: "drifter", x: 2200, y: 1400 },
  { kind: "drifter", x: 1500, y: 1800 },
  { kind: "shoota", x: 1100, y: 800 },
  { kind: "shoota", x: 1900, y: 800 },
  { kind: "shoota", x: 700, y: 2200 },
  { kind: "shoota", x: 2300, y: 2200 },
  { kind: "police", x: 1500, y: 1500 },
  { kind: "police", x: 900, y: 2000 },
];

// ---------------------------------------------------------------------------
// Extraction Zone  (zone: x 350-1800, y 3300-4800)
// ---------------------------------------------------------------------------
const EXTRACTION_STRUCTURES: BuildingSpec[] = [
  // Perimeter fences (loose, open feel)
  { type: "fence_h", x: 750, y: 3350 },
  { type: "fence_h", x: 1350, y: 3350 },
  { type: "fence_h", x: 750, y: 4750 },
  { type: "fence_h", x: 1350, y: 4750 },
  { type: "fence_v", x: 400, y: 3750 },
  { type: "fence_v", x: 400, y: 4300 },
  // East side open (entrance from military side left unblocked)
  { type: "fence_v", x: 1750, y: 3750 },
  { type: "fence_v", x: 1750, y: 4300 },

  // Control booth
  { type: "m", x: 1550, y: 3600, label: "Control Booth" },
];

// No enemies at extraction zone (safe area)

// ---------------------------------------------------------------------------
// Abandoned Village  (zone: x 3200-6500, y 250-2500)
// ---------------------------------------------------------------------------
const VILLAGE_STRUCTURES: BuildingSpec[] = [
  { type: "m", x: 3600, y: 650, label: "House" },
  { type: "m", x: 4050, y: 900, label: "House" },
  { type: "m", x: 3700, y: 1400, label: "House" },
  { type: "l", x: 3550, y: 2000, label: "Farm" },
  { type: "m", x: 4800, y: 700, label: "Blacksmith" },
  { type: "m", x: 5400, y: 1100, label: "Clinic" },
  // Scattered fence fragments (ruined village feel)
  { type: "fence_h", x: 3900, y: 1200 },
  { type: "fence_v", x: 4300, y: 1600 },
  { type: "fence_h", x: 5100, y: 800 },
];

const VILLAGE_ENEMIES: EnemySpec[] = [
  { kind: "drifter", x: 4200, y: 1300 },
  { kind: "drifter", x: 3900, y: 700 },
  { kind: "drifter", x: 5000, y: 1500 },
];

// ---------------------------------------------------------------------------
// Outpost  (zone: x 3200-6100, y 4800-6700)
// ---------------------------------------------------------------------------
const OUTPOST_STRUCTURES: BuildingSpec[] = [
  { type: "tent", x: 3550, y: 5200 },
  { type: "tent", x: 3900, y: 5550 },
  { type: "tent", x: 4300, y: 5100 },
  { type: "tent", x: 4700, y: 5500 },
  { type: "tent", x: 5100, y: 5200 },
  { type: "tent", x: 5500, y: 5600 },
  { type: "tent", x: 5800, y: 5050 },
  { type: "tent", x: 6000, y: 5450 },
  { type: "m", x: 4750, y: 5900, label: "Watchtower" },
  { type: "m", x: 4300, y: 5900, label: "Supply Cache" },
  // Fence fragments (ruined perimeter)
  { type: "fence_h", x: 3700, y: 4950 },
  { type: "fence_h", x: 4900, y: 4950 },
  { type: "fence_v", x: 3300, y: 5500 },
  { type: "fence_v", x: 6200, y: 5300 },
];

const OUTPOST_ENEMIES: EnemySpec[] = [
  { kind: "drifter", x: 4000, y: 5350 },
  { kind: "drifter", x: 4600, y: 5200 },
  { kind: "drifter", x: 5300, y: 5700 },
  { kind: "drifter", x: 5700, y: 5200 },
  { kind: "shoota", x: 4800, y: 6100 },
  { kind: "shoota", x: 5200, y: 5500 },
  { kind: "shoota", x: 3800, y: 5800 },
];

// ---------------------------------------------------------------------------
// Forest  (zone: x 7000-9800, y 200-6800)
// 75 trees in clusters leaving navigable corridors
// ---------------------------------------------------------------------------
const FOREST_TREES: { x: number; y: number }[] = [
  // Top cluster
  { x: 7150, y: 420 }, { x: 7400, y: 620 }, { x: 7700, y: 470 },
  { x: 7950, y: 720 }, { x: 8200, y: 420 }, { x: 8500, y: 680 },
  { x: 7300, y: 920 }, { x: 7650, y: 1100 }, { x: 7900, y: 960 },
  { x: 8150, y: 1200 }, { x: 8450, y: 870 }, { x: 9050, y: 530 },
  { x: 9300, y: 820 }, { x: 9580, y: 440 }, { x: 9200, y: 1120 },
  { x: 7100, y: 1450 }, { x: 7450, y: 1620 }, { x: 7800, y: 1480 },
  { x: 8100, y: 1720 }, { x: 8500, y: 1380 }, { x: 9480, y: 1540 },

  // Mid cluster
  { x: 7200, y: 2420 }, { x: 7520, y: 2720 }, { x: 7900, y: 2520 },
  { x: 8230, y: 2820 }, { x: 8620, y: 2430 }, { x: 9120, y: 2620 },
  { x: 9420, y: 2920 }, { x: 9680, y: 2540 }, { x: 7120, y: 3220 },
  { x: 7460, y: 3420 }, { x: 7760, y: 3120 }, { x: 8020, y: 3520 },
  { x: 8420, y: 3230 }, { x: 8780, y: 3580 }, { x: 9220, y: 3320 },
  { x: 9520, y: 3720 }, { x: 7330, y: 3920 }, { x: 7720, y: 4120 },
  { x: 8120, y: 3830 }, { x: 8520, y: 4230 }, { x: 8920, y: 3940 },
  { x: 9150, y: 4320 }, { x: 9620, y: 4130 }, { x: 7630, y: 4520 },
  { x: 8320, y: 4620 }, { x: 9030, y: 4530 }, { x: 8720, y: 4830 },
  { x: 7430, y: 4940 }, { x: 9230, y: 4730 }, { x: 7130, y: 4230 },

  // Bottom cluster
  { x: 7220, y: 5130 }, { x: 7620, y: 5330 }, { x: 8020, y: 5030 },
  { x: 8430, y: 5430 }, { x: 8830, y: 5130 }, { x: 9330, y: 5230 },
  { x: 9630, y: 5630 }, { x: 7320, y: 5830 }, { x: 7730, y: 6030 },
  { x: 8130, y: 5730 }, { x: 8530, y: 6130 }, { x: 8930, y: 5830 },
  { x: 9230, y: 6030 }, { x: 9520, y: 6430 }, { x: 7130, y: 6250 },
  { x: 7530, y: 6530 }, { x: 8230, y: 6330 }, { x: 8730, y: 6630 },
  { x: 9130, y: 6430 }, { x: 7930, y: 6630 }, { x: 9680, y: 5930 },
];

// ---------------------------------------------------------------------------
// Scattered terrain rocks across the map
// ---------------------------------------------------------------------------
const TERRAIN_ROCKS: BuildingSpec[] = [
  // Near military base approaches
  { type: "m", x: 1100, y: 3000, label: "Rock" },
  { type: "m", x: 2400, y: 3100, label: "Rock" },
  { type: "m", x: 2800, y: 2000, label: "Rock" },

  // Between zones (no-man's land)
  { type: "m", x: 2900, y: 1500, label: "Rock" },
  { type: "m", x: 2950, y: 3500, label: "Rock" },
  { type: "m", x: 1900, y: 5500, label: "Rock" },
  { type: "m", x: 2600, y: 6000, label: "Rock" },

  // Around village outskirts
  { type: "m", x: 6200, y: 1800, label: "Rock" },
  { type: "m", x: 6400, y: 2800, label: "Rock" },
  { type: "m", x: 6600, y: 1200, label: "Rock" },

  // Around outpost outskirts
  { type: "m", x: 6100, y: 6000, label: "Rock" },
  { type: "m", x: 6300, y: 5400, label: "Rock" },
  { type: "m", x: 2800, y: 5900, label: "Rock" },

  // Forest edge rocks (transition zone)
  { type: "m", x: 6750, y: 3500, label: "Rock" },
  { type: "m", x: 6850, y: 5000, label: "Rock" },
  { type: "m", x: 6700, y: 6400, label: "Rock" },
];

function spawnBuilding(world: World, spec: BuildingSpec): void {
  const id = world.allocEntityId();
  let building: Building;

  switch (spec.type) {
    case "xl": {
      const b = new BuildingXl(id);
      b.label = spec.label;
      building = b;
      break;
    }
    case "l": {
      const b = new BuildingL(id);
      b.label = spec.label;
      building = b;
      break;
    }
    case "m": {
      const b = new BuildingM(id);
      b.label = spec.label;
      building = b;
      break;
    }
    case "fence_h":
      building = new FenceH(id);
      break;
    case "fence_v":
      building = new FenceV(id);
      break;
    case "tent":
      building = new Tent(id);
      break;
    case "tree":
      building = new Tree(id);
      break;
  }

  building.x = spec.x;
  building.y = spec.y;
  building.hp = 0;
  building.maxHp = 0;
  world.spawn(building);
}

function spawnEnemy(world: World, spec: EnemySpec): void {
  const id = world.allocEntityId();
  let enemy;

  switch (spec.kind) {
    case "drifter":
      enemy = new Drifter(id);
      break;
    case "shoota":
      enemy = new Shoota(id);
      break;
    case "police":
      enemy = new Police(id);
      break;
  }

  enemy.x = spec.x;
  enemy.y = spec.y;
  world.spawn(enemy);
}

/**
 * Spawns all static map structures and initial enemies into the world.
 * Call once during server initialization after bootstrapTypeRegistries().
 */
export function loadMap(world: World): void {
  for (const spec of MILITARY_STRUCTURES) {
    spawnBuilding(world, spec);
  }
  for (const spec of EXTRACTION_STRUCTURES) {
    spawnBuilding(world, spec);
  }
  for (const spec of VILLAGE_STRUCTURES) {
    spawnBuilding(world, spec);
  }
  for (const spec of OUTPOST_STRUCTURES) {
    spawnBuilding(world, spec);
  }
  for (const pos of FOREST_TREES) {
    spawnBuilding(world, { type: "tree", x: pos.x, y: pos.y });
  }
  for (const spec of TERRAIN_ROCKS) {
    spawnBuilding(world, spec);
  }

  for (const spec of MILITARY_ENEMIES) {
    spawnEnemy(world, spec);
  }
  for (const spec of VILLAGE_ENEMIES) {
    spawnEnemy(world, spec);
  }
  for (const spec of OUTPOST_ENEMIES) {
    spawnEnemy(world, spec);
  }
}
