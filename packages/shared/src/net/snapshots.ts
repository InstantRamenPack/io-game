import { HitboxRectSchema } from "@shared/geometry/hitbox.ts";
import { AttackStyleSchema, ENTITY_KINDS } from "@shared/content/schema.ts";
import { NetEventSchema } from "@shared/net/events.ts";
import {
  EntityIdSchema,
  HotbarIndexSchema,
  HotbarSlotArrayLength,
  NonNegativeIntSchema,
  PositiveIntSchema,
  ResourceIdSchema,
  makeFixedLengthArraySchema,
} from "@shared/validation/schemas.ts";
import { z } from "zod";

export const DayNightPhaseSchema = z.enum(["day", "night"]);
export type DayNightPhase = z.infer<typeof DayNightPhaseSchema>;

const StackableCountSnapshotSchema = z.object({
  typeId: ResourceIdSchema,
  amount: PositiveIntSchema,
});

export const WeaponSnapshotSchema = z.object({
  typeId: ResourceIdSchema,
  ownerId: EntityIdSchema.optional(),
  cooldownTicksRemaining: NonNegativeIntSchema.optional(),
  ammoInMag: NonNegativeIntSchema.optional(),
  magSize: PositiveIntSchema.optional(),
  reserveMagCount: NonNegativeIntSchema.optional(),
  reloadTicks: PositiveIntSchema.optional(),
  reloadTicksRemaining: NonNegativeIntSchema.optional(),
});

export const EquippedItemSnapshotSchema = z.object({
  typeId: ResourceIdSchema,
  attackStyle: AttackStyleSchema,
  cooldownTicksRemaining: NonNegativeIntSchema,
  ammoInMag: NonNegativeIntSchema.optional(),
  magSize: PositiveIntSchema.optional(),
  reserveMagCount: NonNegativeIntSchema.optional(),
  reloadTicks: PositiveIntSchema.optional(),
  reloadTicksRemaining: NonNegativeIntSchema.optional(),
});

const EmptyInventorySlotSnapshotSchema = z.object({
  kind: z.literal("empty"),
});

const WeaponInventorySlotSnapshotSchema = WeaponSnapshotSchema.extend({
  kind: z.literal("weapon"),
});

const BuildableInventorySlotSnapshotSchema = z.object({
  kind: z.literal("buildable"),
  typeId: ResourceIdSchema,
  count: PositiveIntSchema,
});

export const InventorySlotSnapshotSchema = z.discriminatedUnion("kind", [
  EmptyInventorySlotSnapshotSchema,
  WeaponInventorySlotSnapshotSchema,
  BuildableInventorySlotSnapshotSchema,
]);

export const InventorySnapshotSchema = z.object({
  resources: z.array(StackableCountSnapshotSchema),
  hotbarSlots: makeFixedLengthArraySchema(
    InventorySlotSnapshotSchema,
    HotbarSlotArrayLength,
  ),
  selectedHotbarIndex: HotbarIndexSchema,
});

export const ActiveEffectSnapshotSchema = z.object({
  typeId: ResourceIdSchema,
  ticksRemaining: PositiveIntSchema,
});

export const EntitySnapshotBaseSchema = z.object({
  id: EntityIdSchema,
  kind: z.enum(ENTITY_KINDS),
  typeId: ResourceIdSchema,
  x: z.number(),
  y: z.number(),
  vx: z.number(),
  vy: z.number(),
  rotation: z.number(),
  hitboxes: z.array(HitboxRectSchema).min(1),
  hp: z.number(),
  maxHp: z.number(),
  alive: z.boolean(),
  ownerId: EntityIdSchema.optional(),
});

export const PlayerSnapshotSchema = EntitySnapshotBaseSchema.extend({
  kind: z.literal("player"),
  name: z.string(),
  inventory: InventorySnapshotSchema,
  activeEffects: z.array(ActiveEffectSnapshotSchema),
  moveSpeed: z.number(),
  equippedItem: EquippedItemSnapshotSchema.optional(),
});

export const EnemySnapshotSchema = EntitySnapshotBaseSchema.extend({
  kind: z.literal("enemy"),
  targetId: EntityIdSchema.optional(),
  equippedItem: EquippedItemSnapshotSchema.optional(),
});

export const BuildingSnapshotSchema = EntitySnapshotBaseSchema.extend({
  kind: z.literal("building"),
  label: z.string(),
  tier: z.number(),
});

export const ProjectileSnapshotSchema = EntitySnapshotBaseSchema.extend({
  kind: z.literal("projectile"),
});

export const PickupSnapshotSchema = EntitySnapshotBaseSchema.extend({
  kind: z.literal("pickup"),
  inventory: InventorySnapshotSchema,
});

export const EntitySnapshotSchema = z.discriminatedUnion("kind", [
  PlayerSnapshotSchema,
  EnemySnapshotSchema,
  BuildingSnapshotSchema,
  ProjectileSnapshotSchema,
  PickupSnapshotSchema,
]);

export const DayNightSnapshotSchema = z.object({
  dayCount: NonNegativeIntSchema,
  phase: DayNightPhaseSchema,
  phaseElapsedMs: NonNegativeIntSchema,
  dayDurationMs: PositiveIntSchema,
  nightDurationMs: PositiveIntSchema,
});

export const WorldSnapshotSchema = z.object({
  tick: NonNegativeIntSchema,
  dayNight: DayNightSnapshotSchema,
  full: z.boolean().optional(),
  entities: z.array(EntitySnapshotSchema),
  removedEntityIds: z.array(EntityIdSchema).optional(),
  events: z.array(NetEventSchema),
});

export const SNAPSHOT_COMPAT_DESCRIPTOR = Object.freeze({
  entityBase: [
    "id",
    "kind",
    "typeId",
    "x",
    "y",
    "vx",
    "vy",
    "rotation",
    "hitboxes",
    "hp",
    "maxHp",
    "alive",
    "ownerId",
  ],
  equippedItem: [
    "typeId",
    "attackStyle",
    "cooldownTicksRemaining",
    "ammoInMag",
    "magSize",
    "reserveMagCount",
    "reloadTicks",
    "reloadTicksRemaining",
  ],
  player: ["name", "inventory", "activeEffects", "moveSpeed", "equippedItem"],
  enemy: ["targetId", "equippedItem"],
  building: ["label", "tier"],
  pickup: ["inventory"],
  world: ["tick", "dayNight", "entities", "events"],
});

export type WeaponSnapshot = z.infer<typeof WeaponSnapshotSchema>;
export type EquippedItemSnapshot = z.infer<typeof EquippedItemSnapshotSchema>;
export type InventorySlotSnapshot = z.infer<typeof InventorySlotSnapshotSchema>;
export type InventorySnapshot = z.infer<typeof InventorySnapshotSchema>;
export type ActiveEffectSnapshot = z.infer<typeof ActiveEffectSnapshotSchema>;
export type EntitySnapshotBase = z.infer<typeof EntitySnapshotBaseSchema>;
export type PlayerSnapshot = z.infer<typeof PlayerSnapshotSchema>;
export type EnemySnapshot = z.infer<typeof EnemySnapshotSchema>;
export type BuildingSnapshot = z.infer<typeof BuildingSnapshotSchema>;
export type ProjectileSnapshot = z.infer<typeof ProjectileSnapshotSchema>;
export type PickupSnapshot = z.infer<typeof PickupSnapshotSchema>;
export type EntitySnapshot = z.infer<typeof EntitySnapshotSchema>;
export type DayNightSnapshot = z.infer<typeof DayNightSnapshotSchema>;
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;
