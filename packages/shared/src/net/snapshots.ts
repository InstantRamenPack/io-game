import { HitboxRectSchema } from "@shared/geometry/hitbox.ts";
import { AttackStyleSchema, ENTITY_KINDS } from "@shared/content/schema.ts";
import { CHEST_SLOT_COUNT } from "@shared/gameplay/constants.ts";
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

export { CHEST_SLOT_COUNT } from "@shared/gameplay/constants.ts";

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
  unlockedRecipeTypeIds: z.array(ResourceIdSchema),
});

export const ActiveEffectSnapshotSchema = z.object({
  typeId: ResourceIdSchema,
  ticksRemaining: PositiveIntSchema,
  preventsAction: z.boolean().optional(),
  speedMultiplier: z.number().finite().nonnegative().optional(),
});

export const EntitySnapshotBaseSchema = z.object({
  id: EntityIdSchema,
  kind: z.enum(ENTITY_KINDS),
  typeId: ResourceIdSchema.optional(),
  x: z.number(),
  y: z.number(),
  vx: z.number(),
  vy: z.number(),
  rotation: z.number(),
  hitboxes: z.array(HitboxRectSchema).min(1).optional(),
  hp: z.number().optional(),
  maxHp: z.number().optional(),
  alive: z.boolean().optional(),
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
  chestSlots: z
    .array(InventorySlotSnapshotSchema)
    .length(CHEST_SLOT_COUNT)
    .optional(),
});

export const StructureSnapshotSchema = EntitySnapshotBaseSchema.extend({
  kind: z.literal("structure"),
  label: z.string(),
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
  StructureSnapshotSchema,
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

export const ExtractionStageSchema = z.enum([
  "locked",
  "active",
  "board_timer",
  "chopper_incoming",
  "complete",
]);

export const ExtractionLockedReasonSchema = z.enum([
  "final_wave",
  "comms_offline",
]);

export const ExtractionSnapshotSchema = z.object({
  stage: ExtractionStageSchema,
  lockedReason: ExtractionLockedReasonSchema.optional(),
  boardElapsedMs: NonNegativeIntSchema,
  chopperElapsedMs: NonNegativeIntSchema,
  playersOnPad: NonNegativeIntSchema,
  totalAlivePlayers: NonNegativeIntSchema,
  enemiesInRadius: NonNegativeIntSchema,
});

export const InfrastructureSnapshotSchema = z.object({
  energyActive: z.boolean(),
  commsActive: z.boolean(),
});

export const MapMarkerSnapshotSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  archetype: z.string().min(1),
  importance: z.enum(["sector", "major", "reward", "route"]),
  discoveredByDefault: z.boolean(),
  x: z.number().finite(),
  y: z.number().finite(),
});

export const MapSectorSnapshotSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  archetype: z.string().min(1),
  row: NonNegativeIntSchema,
  col: NonNegativeIntSchema,
  minX: z.number().finite(),
  minY: z.number().finite(),
  maxX: z.number().finite(),
  maxY: z.number().finite(),
  hasLightsOut: z.boolean(),
});

export const MapFeatureSnapshotSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  role: z.string().min(1),
  risk: z.enum(["low", "medium", "high", "boss"]),
  hasReward: z.boolean(),
  minX: z.number().finite(),
  minY: z.number().finite(),
  maxX: z.number().finite(),
  maxY: z.number().finite(),
  centerX: z.number().finite(),
  centerY: z.number().finite(),
});

export const MapSnapshotSchema = z.object({
  seed: z.number().int(),
  sectorSize: PositiveIntSchema,
  centerSectorId: z.string().min(1),
  extractionSectorId: z.string().min(1),
  dungeonSectorId: z.string().min(1),
  militarySectorId: z.string().min(1),
  forestSectorId: z.string().min(1),
  sectors: z.array(MapSectorSnapshotSchema),
  features: z.array(MapFeatureSnapshotSchema),
  markers: z.array(MapMarkerSnapshotSchema),
});

export const VisibilitySnapshotSchema = z.object({
  restricted: z.boolean(),
  radius: z.number().finite().positive(),
  centerX: z.number().finite(),
  centerY: z.number().finite(),
});

export const MinimapPlayerSnapshotSchema = z.object({
  id: EntityIdSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  alive: z.boolean(),
});

export const WorldSnapshotSchema = z.object({
  tick: NonNegativeIntSchema,
  lastProcessedSeq: z.number().int().min(-1).optional(),
  dayNight: DayNightSnapshotSchema,
  extraction: ExtractionSnapshotSchema,
  infrastructure: InfrastructureSnapshotSchema,
  map: MapSnapshotSchema.optional(),
  visibility: VisibilitySnapshotSchema.optional(),
  minimapPlayers: z.array(MinimapPlayerSnapshotSchema).optional(),
  full: z.boolean().optional(),
  entities: z.array(EntitySnapshotSchema),
  removedEntityIds: z.array(EntityIdSchema).optional(),
  events: z.array(NetEventSchema),
});

type ObjectSchema = z.ZodObject<z.ZodRawShape>;

function schemaKeys(schema: ObjectSchema): readonly string[] {
  return Object.freeze([...schema.keyof().options]);
}

function extensionSchemaKeys(
  baseSchema: ObjectSchema,
  extendedSchema: ObjectSchema,
): readonly string[] {
  const base = new Set(schemaKeys(baseSchema));
  return Object.freeze(
    schemaKeys(extendedSchema).filter((key) => !base.has(key)),
  );
}

function assertDescriptorCoverage(
  label: string,
  descriptor: readonly string[],
  schema: ObjectSchema,
): void {
  const descriptorSet = new Set(descriptor);
  const schemaKeyList = schemaKeys(schema);
  const schemaSet = new Set(schemaKeyList);
  const missingKeys = schemaKeyList.filter((key) => !descriptorSet.has(key));
  const unknownKeys = descriptor.filter((key) => !schemaSet.has(key));
  if (missingKeys.length === 0 && unknownKeys.length === 0) {
    return;
  }
  throw new Error(
    `[compat] Snapshot descriptor mismatch for ${label}. missing=${missingKeys.join(",")} unknown=${unknownKeys.join(",")}`,
  );
}

export const SNAPSHOT_COMPAT_DESCRIPTOR = Object.freeze({
  entityBase: schemaKeys(EntitySnapshotBaseSchema),
  equippedItem: schemaKeys(EquippedItemSnapshotSchema),
  player: extensionSchemaKeys(EntitySnapshotBaseSchema, PlayerSnapshotSchema),
  enemy: extensionSchemaKeys(EntitySnapshotBaseSchema, EnemySnapshotSchema),
  building: extensionSchemaKeys(
    EntitySnapshotBaseSchema,
    BuildingSnapshotSchema,
  ),
  structure: extensionSchemaKeys(
    EntitySnapshotBaseSchema,
    StructureSnapshotSchema,
  ),
  pickup: extensionSchemaKeys(EntitySnapshotBaseSchema, PickupSnapshotSchema),
  world: schemaKeys(WorldSnapshotSchema),
});

assertDescriptorCoverage(
  "entityBase",
  SNAPSHOT_COMPAT_DESCRIPTOR.entityBase,
  EntitySnapshotBaseSchema,
);
assertDescriptorCoverage(
  "equippedItem",
  SNAPSHOT_COMPAT_DESCRIPTOR.equippedItem,
  EquippedItemSnapshotSchema,
);
assertDescriptorCoverage(
  "world",
  SNAPSHOT_COMPAT_DESCRIPTOR.world,
  WorldSnapshotSchema,
);

export type WeaponSnapshot = z.infer<typeof WeaponSnapshotSchema>;
export type EquippedItemSnapshot = z.infer<typeof EquippedItemSnapshotSchema>;
export type InventorySlotSnapshot = z.infer<typeof InventorySlotSnapshotSchema>;
export type InventorySnapshot = z.infer<typeof InventorySnapshotSchema>;
export type ActiveEffectSnapshot = z.infer<typeof ActiveEffectSnapshotSchema>;
export type EntitySnapshotBase = z.infer<typeof EntitySnapshotBaseSchema>;
export type PlayerSnapshot = z.infer<typeof PlayerSnapshotSchema>;
export type EnemySnapshot = z.infer<typeof EnemySnapshotSchema>;
export type BuildingSnapshot = z.infer<typeof BuildingSnapshotSchema>;
export type StructureSnapshot = z.infer<typeof StructureSnapshotSchema>;
export type ProjectileSnapshot = z.infer<typeof ProjectileSnapshotSchema>;
export type PickupSnapshot = z.infer<typeof PickupSnapshotSchema>;
export type EntitySnapshot = z.infer<typeof EntitySnapshotSchema>;
export type DayNightSnapshot = z.infer<typeof DayNightSnapshotSchema>;
export type ExtractionStage = z.infer<typeof ExtractionStageSchema>;
export type ExtractionLockedReason = z.infer<
  typeof ExtractionLockedReasonSchema
>;
export type ExtractionSnapshot = z.infer<typeof ExtractionSnapshotSchema>;
export type InfrastructureSnapshot = z.infer<
  typeof InfrastructureSnapshotSchema
>;
export type MapMarkerSnapshot = z.infer<typeof MapMarkerSnapshotSchema>;
export type MapSectorSnapshot = z.infer<typeof MapSectorSnapshotSchema>;
export type MapFeatureSnapshot = z.infer<typeof MapFeatureSnapshotSchema>;
export type MapSnapshot = z.infer<typeof MapSnapshotSchema>;
export type VisibilitySnapshot = z.infer<typeof VisibilitySnapshotSchema>;
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;
