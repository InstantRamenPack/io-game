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
  reloadTicksRemaining: z.number().int().nonnegative().optional(),
});

export const InventorySnapshotSchema = z.object({
  stackables: z.array(StackableCountSnapshotSchema),
  weapons: z.array(WeaponSnapshotSchema),
  activeWeaponIndex: z.number().int().nonnegative().nullable(),
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
  activeEffects: z.array(z.string()),
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

export const WorldSnapshotSchema = z.object({
  tick: z.number().int().nonnegative(),
  entities: z.array(EntitySnapshotSchema),
  events: z.array(NetEventSchema),
});

export type StackableCountSnapshot = z.infer<
  typeof StackableCountSnapshotSchema
>;
export type WeaponSnapshot = z.infer<typeof WeaponSnapshotSchema>;
export type InventorySnapshot = z.infer<typeof InventorySnapshotSchema>;
export type PlayerInventorySnapshot = InventorySnapshot;
export type EntitySnapshotBase = z.infer<typeof EntitySnapshotBaseSchema>;
export type PlayerSnapshot = z.infer<typeof PlayerSnapshotSchema>;
export type EnemySnapshot = z.infer<typeof EnemySnapshotSchema>;
export type BuildingSnapshot = z.infer<typeof BuildingSnapshotSchema>;
export type ProjectileSnapshot = z.infer<typeof ProjectileSnapshotSchema>;
export type PickupSnapshot = z.infer<typeof PickupSnapshotSchema>;
export type EntitySnapshot = z.infer<typeof EntitySnapshotSchema>;
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;
