import { HitboxRectSchema } from "@shared/geometry/hitbox.ts";
import { ENTITY_KINDS } from "@shared/content/schema.ts";
import {
  RESOURCE_ID_PATTERN,
  type ResourceId,
} from "@shared/ids/ResourceId.ts";
import { NetEventSchema } from "@shared/net/events.ts";
import { z } from "zod";

const ResourceIdSchema = z
  .string()
  .regex(RESOURCE_ID_PATTERN)
  .transform((typeId) => typeId as ResourceId);

export const StackableCountSnapshotSchema = z.object({
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

export const EmptyInventorySlotSnapshotSchema = z.object({
  kind: z.literal("empty"),
});

export const WeaponInventorySlotSnapshotSchema = WeaponSnapshotSchema.extend({
  kind: z.literal("weapon"),
});

export const BuildableInventorySlotSnapshotSchema = z.object({
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
  ownerId: z.number().int().nonnegative().optional(),
});

export const PlayerSnapshotSchema = EntitySnapshotBaseSchema.extend({
  kind: z.literal("player"),
  name: z.string(),
  inventory: InventorySnapshotSchema,
  activeEffects: z.array(ActiveEffectSnapshotSchema),
  moveSpeed: z.number(),
});

export const EnemySnapshotSchema = EntitySnapshotBaseSchema.extend({
  kind: z.literal("enemy"),
  targetId: z.number().int().nonnegative().optional(),
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
  phase: z.enum(["day", "night"]),
  phaseElapsedMs: z.number().int().nonnegative(),
  dayDurationMs: z.number().int().positive(),
  nightDurationMs: z.number().int().positive(),
});

export const WorldSnapshotSchema = z.object({
  tick: z.number().int().nonnegative(),
  dayNight: DayNightSnapshotSchema,
  entities: z.array(EntitySnapshotSchema),
  events: z.array(NetEventSchema),
});

export type StackableCountSnapshot = z.infer<
  typeof StackableCountSnapshotSchema
>;
export type WeaponSnapshot = z.infer<typeof WeaponSnapshotSchema>;
export type EmptyInventorySlotSnapshot = z.infer<
  typeof EmptyInventorySlotSnapshotSchema
>;
export type WeaponInventorySlotSnapshot = z.infer<
  typeof WeaponInventorySlotSnapshotSchema
>;
export type BuildableInventorySlotSnapshot = z.infer<
  typeof BuildableInventorySlotSnapshotSchema
>;
export type InventorySlotSnapshot = z.infer<typeof InventorySlotSnapshotSchema>;
export type InventorySnapshot = z.infer<typeof InventorySnapshotSchema>;
export type ActiveEffectSnapshot = z.infer<typeof ActiveEffectSnapshotSchema>;
export type PlayerInventorySnapshot = InventorySnapshot;
export type EntitySnapshotBase = z.infer<typeof EntitySnapshotBaseSchema>;
export type PlayerSnapshot = z.infer<typeof PlayerSnapshotSchema>;
export type EnemySnapshot = z.infer<typeof EnemySnapshotSchema>;
export type BuildingSnapshot = z.infer<typeof BuildingSnapshotSchema>;
export type ProjectileSnapshot = z.infer<typeof ProjectileSnapshotSchema>;
export type PickupSnapshot = z.infer<typeof PickupSnapshotSchema>;
export type EntitySnapshot = z.infer<typeof EntitySnapshotSchema>;
export type DayNightSnapshot = z.infer<typeof DayNightSnapshotSchema>;
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;
