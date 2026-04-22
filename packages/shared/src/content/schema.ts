import { z } from "zod";
import { HitboxRectSchema } from "@shared/geometry/hitbox.ts";
import {
  HotbarIndexSchema,
  ResourceIdSchema,
} from "@shared/validation/schemas.ts";

export const ENTITY_KINDS = [
  "player",
  "enemy",
  "building",
  "projectile",
  "pickup",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export const CollisionModeSchema = z.enum(["none", "static", "dynamic"]);
export type CollisionMode = z.infer<typeof CollisionModeSchema>;

export const AttackStyleSchema = z.enum(["shoot", "swing", "jab"]);

export const EquippedRenderSchema = z.object({
  textureTypeId: ResourceIdSchema.optional(),
  holdOffset: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  holdRotationDeg: z.number().finite().default(0),
  scale: z.number().finite().positive().default(1),
  handedness: z.enum(["right", "left"]).default("right"),
  recoilDistance: z.number().finite().nonnegative().default(0),
  swingAngleDeg: z.number().finite().nonnegative().default(0),
  jabDistance: z.number().finite().nonnegative().default(0),
});

export const ShootWeaponContentSchema = z.object({
  attackStyle: z.literal("shoot"),
  cooldownTicks: z.number().int().positive(),
  projectileTypeId: ResourceIdSchema,
  magSize: z.number().int().positive(),
  reloadTicks: z.number().int().positive(),
  spreadDeg: z.number().finite().nonnegative().default(0),
  magItemTypeId: ResourceIdSchema.optional(),
  equippedRender: EquippedRenderSchema,
});

export const SwingWeaponContentSchema = z.object({
  attackStyle: z.literal("swing"),
  cooldownTicks: z.number().int().positive(),
  range: z.number().finite().positive(),
  damage: z.number().finite().nonnegative(),
  knockback: z.number().finite().nonnegative().default(0),
  sweepArcDeg: z.number().finite().positive(),
  equippedRender: EquippedRenderSchema,
});

export const JabWeaponContentSchema = z.object({
  attackStyle: z.literal("jab"),
  cooldownTicks: z.number().int().positive(),
  range: z.number().finite().positive(),
  damage: z.number().finite().nonnegative(),
  knockback: z.number().finite().nonnegative().default(0),
  jabWidth: z.number().finite().positive(),
  equippedRender: EquippedRenderSchema,
});

export const WeaponContentSchema = z.discriminatedUnion("attackStyle", [
  ShootWeaponContentSchema,
  SwingWeaponContentSchema,
  JabWeaponContentSchema,
]);

export const ProjectileContentSchema = z.object({
  speed: z.number().finite().positive(),
  range: z.number().finite().positive(),
  damage: z.number().finite().nonnegative().default(0),
  maxHits: z.number().int().positive().nullable().optional(),
  hitbox: z.object({
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  }),
});

export const ItemRequirementSchema = z.object({
  typeId: ResourceIdSchema,
  amount: z.number().int().positive(),
});

export const ItemRecipeContentSchema = z.object({
  hint: z.string().min(1).optional(),
  outputAmount: z.number().int().positive().default(1),
  costs: z.array(ItemRequirementSchema).min(1),
});

export const PlayerStarterLoadoutSchema = z.object({
  selectedHotbarIndex: HotbarIndexSchema.default(0),
  weapons: z.array(ResourceIdSchema).default([]),
  stackables: z.array(ItemRequirementSchema).default([]),
});

export const ItemContentSchema = z.object({
  label: z.string().min(1),
  hint: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  iconTextureId: ResourceIdSchema.optional(),
  recipe: ItemRecipeContentSchema.optional(),
  unlocksRecipeTypeId: ResourceIdSchema.optional(),
  buildsEntityTypeId: ResourceIdSchema.optional(),
  weapon: WeaponContentSchema.optional(),
  food: z.object({ foodRestore: z.number().finite().positive() }).optional(),
});

export const EntityContentSchema = z.object({
  label: z.string().min(1),
  hint: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  iconTextureId: ResourceIdSchema.optional(),
  maxHp: z.number().finite().nonnegative().optional(),
  moveSpeed: z.number().finite().nonnegative().optional(),
  collisionMode: CollisionModeSchema.optional(),
  hitboxProfiles: z
    .record(z.string().min(1), z.array(HitboxRectSchema).min(1))
    .optional(),
  activeHitboxProfile: z.string().min(1).optional(),
  projectile: ProjectileContentSchema.optional(),
  player: z
    .object({
      starterLoadout: PlayerStarterLoadoutSchema.optional(),
    })
    .optional(),
});

export const EffectContentSchema = z.object({
  label: z.string().min(1),
  hint: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

export type AttackStyle = z.infer<typeof AttackStyleSchema>;
export type EquippedRender = z.infer<typeof EquippedRenderSchema>;
export type ShootWeaponContent = z.infer<typeof ShootWeaponContentSchema>;
export type SwingWeaponContent = z.infer<typeof SwingWeaponContentSchema>;
export type JabWeaponContent = z.infer<typeof JabWeaponContentSchema>;
export type WeaponContent = z.infer<typeof WeaponContentSchema>;
export type ProjectileContent = z.infer<typeof ProjectileContentSchema>;
export type ItemRequirement = z.infer<typeof ItemRequirementSchema>;
export type ItemRecipeContent = z.infer<typeof ItemRecipeContentSchema>;
export type PlayerStarterLoadout = z.infer<typeof PlayerStarterLoadoutSchema>;
export type FoodContent = { foodRestore: number };
export type ItemContent = z.infer<typeof ItemContentSchema>;
export type EntityContent = z.infer<typeof EntityContentSchema>;
export type EffectContent = z.infer<typeof EffectContentSchema>;
