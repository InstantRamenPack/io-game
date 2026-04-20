import { HitboxRectSchema } from "@shared/geometry/hitbox.ts";
import { AttackStyleSchema, ENTITY_KINDS } from "@shared/content/schema.ts";
import {
  RESOURCE_ID_PATTERN,
  assertResourceId,
} from "@shared/ids/ResourceId.ts";
import { NetEventSchema } from "@shared/net/events.ts";
import { z } from "zod";

const ResourceIdSchema = z
  .string()
  .regex(RESOURCE_ID_PATTERN)
  .transform((typeId) => assertResourceId(typeId));

export const DayNightPhaseSchema = z.enum(["day", "night"]);
export type DayNightPhase = z.infer<typeof DayNightPhaseSchema>;

const StackableCountSnapshotSchema = z.object({
  typeId: ResourceIdSchema,
  amount: z.number().int().positive(),
});

export const WeaponSnapshotSchema = z.object({
  typeId: ResourceIdSchema,
  ownerId: z.number().int().nonnegative().optional(),
  cooldownTicksRemaining: z.number().int().nonnegative().optional(),
  ammoInMag: z.number().int().nonnegative().optional(),
  magSize: z.number().int().positive().optional(),
  reserveMagCount: z.number().int().nonnegative().optional(),
  reloadTicks: z.number().int().positive().optional(),
  reloadTicksRemaining: z.number().int().nonnegative().optional(),
});

export const EquippedItemSnapshotSchema = z.object({
  typeId: ResourceIdSchema,
  attackStyle: AttackStyleSchema,
  cooldownTicksRemaining: z.number().int().nonnegative(),
  ammoInMag: z.number().int().nonnegative().optional(),
  magSize: z.number().int().positive().optional(),
  reserveMagCount: z.number().int().nonnegative().optional(),
  reloadTicks: z.number().int().positive().optional(),
  reloadTicksRemaining: z.number().int().nonnegative().optional(),
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
  count: z.number().int().positive(),
});

export const InventorySlotSnapshotSchema = z.discriminatedUnion("kind", [
  EmptyInventorySlotSnapshotSchema,
  WeaponInventorySlotSnapshotSchema,
  BuildableInventorySlotSnapshotSchema,
]);

export const InventorySnapshotSchema = z.object({
  resources: z.array(StackableCountSnapshotSchema),
  hotbarSlots: z.array(InventorySlotSnapshotSchema).length(10),
  selectedHotbarIndex: z.number().int().min(0).max(9),
});

export const ActiveEffectSnapshotSchema = z.object({
  typeId: ResourceIdSchema,
  ticksRemaining: z.number().int().positive(),
});

export const EntitySnapshotBaseSchema = z.object({
  id: z.number().int().nonnegative(),
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
  ownerId: z.number().int().nonnegative().optional(),
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
  targetId: z.number().int().nonnegative().optional(),
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
  dayCount: z.number().int().nonnegative(),
  phase: DayNightPhaseSchema,
  phaseElapsedMs: z.number().int().nonnegative(),
  dayDurationMs: z.number().int().positive(),
  nightDurationMs: z.number().int().positive(),
});

export const WorldSnapshotSchema = z.object({
  tick: z.number().int().nonnegative(),
  dayNight: DayNightSnapshotSchema,
  full: z.boolean().optional(),
  entities: z.array(EntitySnapshotSchema),
  removedEntityIds: z.array(z.number().int().nonnegative()).optional(),
  events: z.array(NetEventSchema),
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
