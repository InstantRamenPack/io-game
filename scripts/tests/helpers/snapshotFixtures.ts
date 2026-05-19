import type {
  DayNightSnapshot,
  EntitySnapshot,
  InventorySnapshot,
  InventorySlotSnapshot,
  WorldSnapshot,
} from "@shared/net/snapshots.ts";
import { CHEST_SLOT_COUNT } from "@shared/net/snapshots.ts";

const DEFAULT_HITBOXES = [{ width: 32, height: 32, offsetX: 0, offsetY: 0 }];

function makeEmptySlot(): InventorySlotSnapshot {
  return { kind: "empty" };
}

export function makeInventorySnapshot(): InventorySnapshot {
  return {
    resources: [],
    hotbarSlots: Array.from({ length: 10 }, () => makeEmptySlot()),
    selectedHotbarIndex: 0,
    unlockedRecipeTypeIds: [],
  };
}

export function makePlayerSnapshot(
  id: number,
  x: number,
  y: number,
  overrides: Partial<Extract<EntitySnapshot, { kind: "player" }>> = {},
): EntitySnapshot {
  return {
    id,
    kind: "player",
    typeId: "player:base",
    x,
    y,
    vx: 0,
    vy: 0,
    rotation: 0,
    hitboxes: DEFAULT_HITBOXES,
    hp: 100,
    maxHp: 100,
    alive: true,
    name: `player-${id}`,
    inventory: makeInventorySnapshot(),
    activeEffects: [],
    moveSpeed: 15,
    ...overrides,
  };
}

export function makeEnemySnapshot(
  id: number,
  x: number,
  y: number,
  overrides: Partial<Extract<EntitySnapshot, { kind: "enemy" }>> = {},
): EntitySnapshot {
  return {
    id,
    kind: "enemy",
    typeId: "enemy:police",
    x,
    y,
    vx: 0,
    vy: 0,
    rotation: 0,
    hitboxes: DEFAULT_HITBOXES,
    hp: 50,
    maxHp: 50,
    alive: true,
    ...overrides,
  };
}

export function makeProjectileSnapshot(
  id: number,
  x: number,
  y: number,
  overrides: Partial<Extract<EntitySnapshot, { kind: "projectile" }>> = {},
): EntitySnapshot {
  return {
    id,
    kind: "projectile",
    typeId: "projectile:basic_bullet",
    x,
    y,
    vx: 0,
    vy: 0,
    rotation: 0,
    hitboxes: DEFAULT_HITBOXES,
    hp: 1,
    maxHp: 1,
    alive: true,
    ...overrides,
  };
}

export function makeBuildingSnapshot(
  id: number,
  x: number,
  y: number,
  overrides: Partial<Extract<EntitySnapshot, { kind: "building" }>> = {},
): EntitySnapshot {
  return {
    id,
    kind: "building",
    typeId: "building:wall",
    x,
    y,
    vx: 0,
    vy: 0,
    rotation: 0,
    hitboxes: DEFAULT_HITBOXES,
    hp: 100,
    maxHp: 100,
    alive: true,
    label: "Wall",
    tier: 1,
    chestSlots: Array.from({ length: CHEST_SLOT_COUNT }, () => makeEmptySlot()),
    ...overrides,
  };
}

export function makeStructureSnapshot(
  id: number,
  x: number,
  y: number,
  overrides: Partial<Extract<EntitySnapshot, { kind: "structure" }>> = {},
): EntitySnapshot {
  return {
    id,
    kind: "structure",
    typeId: "structure:fence_h",
    x,
    y,
    vx: 0,
    vy: 0,
    rotation: 0,
    hitboxes: DEFAULT_HITBOXES,
    hp: 100,
    maxHp: 100,
    alive: true,
    label: "Fence",
    ...overrides,
  };
}

export function makePickupSnapshot(
  id: number,
  x: number,
  y: number,
  overrides: Partial<Extract<EntitySnapshot, { kind: "pickup" }>> = {},
): EntitySnapshot {
  return {
    id,
    kind: "pickup",
    typeId: "pickup:item_entity",
    x,
    y,
    vx: 0,
    vy: 0,
    rotation: 0,
    hitboxes: DEFAULT_HITBOXES,
    hp: 1,
    maxHp: 1,
    alive: true,
    inventory: makeInventorySnapshot(),
    ...overrides,
  };
}

export function makeDayNightSnapshot(tick = 0): DayNightSnapshot {
  return {
    dayCount: 0,
    phase: "day",
    phaseElapsedMs: tick * 50,
    dayDurationMs: 120000,
    nightDurationMs: 60000,
  };
}

export function makeSnapshot(
  tick: number,
  entities: EntitySnapshot[],
  options: {
    full?: boolean;
    lastProcessedSeq?: number;
    removedEntityIds?: number[];
    events?: WorldSnapshot["events"];
    dayNight?: DayNightSnapshot;
    extraction?: WorldSnapshot["extraction"];
  } = {},
): WorldSnapshot {
  return {
    tick,
    lastProcessedSeq: options.lastProcessedSeq ?? tick,
    dayNight: options.dayNight ?? makeDayNightSnapshot(tick),
    extraction:
      options.extraction ??
      ({
        stage: "locked",
        boardElapsedMs: 0,
        chopperElapsedMs: 0,
        playersOnPad: 0,
        totalAlivePlayers: 0,
        enemiesInRadius: 0,
      } satisfies WorldSnapshot["extraction"]),
    infrastructure: { energyActive: true, commsActive: true },
    full: options.full ?? true,
    entities,
    removedEntityIds: options.removedEntityIds ?? [],
    events: options.events ?? [],
  };
}
