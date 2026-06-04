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
  "tower",
  "structure",
  "projectile",
  "pickup",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export const CollisionModeSchema = z.enum(["none", "static", "dynamic"]);
export type CollisionMode = z.infer<typeof CollisionModeSchema>;

export const AttackStyleSchema = z.enum(["shoot", "swing", "jab"]);
export const RarityTierSchema = z.enum([
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
]);

export const ItemSpriteRenderingSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  rotationDeg: z.number().finite().default(0),
  scale: z.number().finite().default(1),
  handedness: z.enum(["right", "left"]).default("right"),
  recoilDistance: z.number().finite().default(0),
  swingAngleDeg: z.number().finite().default(0),
  jabDistance: z.number().finite().default(0),
});

export const ItemIconRenderingSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  rotationDeg: z.number().finite().default(0),
  scale: z.number().finite().default(1),
});

export const KatanaComboStabRenderingSchema = z.object({
  jabDistance: z.number().finite().nonnegative(),
});

export const ItemRenderingSchema = z.object({
  assetPath: z.string().min(1),
  sprite: ItemSpriteRenderingSchema,
  icon: ItemIconRenderingSchema,
  comboStab: KatanaComboStabRenderingSchema.optional(),
});

export const SwingComboWeaponContentSchema = z.object({
  chainWindowCooldownMultiplier: z.number().finite().positive().default(1.5),
  stabDamageMultiplier: z.number().finite().positive().default(1.5),
  stabWidth: z.number().finite().positive().default(18),
  stabRange: z.number().finite().positive(),
});

export const WeaponPresentationSchema = z.object({
  aimGuide: z.enum(["sniper"]).optional(),
});

export const ShootWeaponSpecialSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("shotgunFan"),
    projectileCount: z.number().int().positive(),
    arcDeg: z.number().finite().positive(),
  }),
  z.object({
    kind: z.literal("firecrackerLauncher"),
    selfKnockback: z.number().finite().nonnegative(),
  }),
]);

export const ShootWeaponContentSchema = z.object({
  attackStyle: z.literal("shoot"),
  cooldownTicks: z.number().int().positive(),
  projectileTypeId: ResourceIdSchema,
  magSize: z.number().int().positive(),
  reloadTicks: z.number().int().positive(),
  spreadDeg: z.number().finite().nonnegative().default(0),
  magItemTypeId: ResourceIdSchema.optional(),
  presentation: WeaponPresentationSchema.optional(),
  special: ShootWeaponSpecialSchema.optional(),
});

export const SwingWeaponContentSchema = z.object({
  attackStyle: z.literal("swing"),
  cooldownTicks: z.number().int().positive(),
  range: z.number().finite().positive(),
  damage: z.number().finite().nonnegative(),
  knockback: z.number().finite().nonnegative().default(0),
  sweepArcDeg: z.number().finite().positive(),
  combo: SwingComboWeaponContentSchema.optional(),
  presentation: WeaponPresentationSchema.optional(),
});

export const JabWeaponContentSchema = z.object({
  attackStyle: z.literal("jab"),
  cooldownTicks: z.number().int().positive(),
  range: z.number().finite().positive(),
  damage: z.number().finite().nonnegative(),
  knockback: z.number().finite().nonnegative().default(0),
  jabWidth: z.number().finite().positive(),
  presentation: WeaponPresentationSchema.optional(),
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
  presentation: z
    .object({
      serverDelayed: z.boolean().default(false),
    })
    .optional(),
  split: z
    .object({
      projectileTypeId: ResourceIdSchema,
      projectileCount: z.number().int().positive(),
      arcDeg: z.number().finite().positive(),
    })
    .optional(),
});

export const VisibilityBlockerContentSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("rects") }),
  z.object({
    mode: z.literal("circle"),
    radius: z.number().finite().positive(),
  }),
]);

export const EntityCombatContentSchema = z.object({
  damageMultiplier: z.number().finite().nonnegative().default(1),
  attackMinIntervalTicks: z.number().int().nonnegative().default(0),
  buildingDamageMultiplier: z.number().finite().nonnegative().optional(),
});

export const TrapEffectContentSchema = z.object({
  typeId: ResourceIdSchema,
  ticksRemaining: z.number().int().positive(),
  pulseIntervalTicks: z.number().int().positive().optional(),
  pulseTicksRemaining: z.number().int().positive().optional(),
  pulseDamage: z.number().finite().positive().optional(),
  speedMultiplier: z.number().finite().positive().optional(),
});

export const TrapContentSchema = z.object({
  triggerRadius: z.number().finite().positive().optional(),
  initialDamage: z.number().finite().nonnegative().optional(),
  effects: z.array(TrapEffectContentSchema).optional(),
});

export const EnemySpawnWeaponsContentSchema = z.object({
  selection: z.enum(["rotating", "all"]),
  typeIds: z.array(ResourceIdSchema).min(1),
});

export const EntityCapabilitiesContentSchema = z.object({
  container: z
    .object({
      slots: z.number().int().positive().optional(),
    })
    .optional(),
  craftingStation: z.boolean().default(false),
  recycler: z.boolean().default(false),
  repairable: z
    .object({
      costItemTypeId: ResourceIdSchema.default("item:hunk"),
      hpPerCostUnit: z.number().finite().positive().default(50),
    })
    .optional(),
  visibilityBlocker: VisibilityBlockerContentSchema.optional(),
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

export const RuntimeServerClassKindSchema = z.enum([
  "material",
  "magazine",
  "rangedWeapon",
  "projectile",
  "effect",
  "custom",
]);

export const RuntimeRegistrationSchema = z
  .object({
    server: z
      .object({
        classKind: RuntimeServerClassKindSchema.optional(),
        symbol: z.string().min(1).optional(),
        importPath: z.string().min(1).optional(),
      })
      .optional(),
    renderer: z
      .object({
        symbol: z.string().min(1).optional(),
        importPath: z.string().min(1).optional(),
      })
      .optional(),
  })
  .optional();

export const ItemContentSchema = z.object({
  label: z.string().min(1),
  hint: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  rendering: ItemRenderingSchema,
  hidden: z.boolean().default(false),
  recipe: ItemRecipeContentSchema.optional(),
  unlocksRecipeTypeId: ResourceIdSchema.optional(),
  unlocksRecipeTypeIds: z.array(ResourceIdSchema).optional(),
  buildsEntityTypeId: ResourceIdSchema.optional(),
  weapon: WeaponContentSchema.optional(),
  rarityTier: RarityTierSchema.optional(),
  healing: z.object({ amount: z.number().finite().positive() }).optional(),
  activeEffect: z
    .object({
      typeId: ResourceIdSchema,
      durationTicks: z.number().int().positive(),
      speedMultiplier: z.number().finite().positive().optional(),
    })
    .optional(),
  armor: z
    .object({
      tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      armorBars: z.number().int().min(0).max(10),
      reflectDamagePct: z.number().finite().min(0).max(1).default(0),
    })
    .optional(),
  consumable: z.boolean().default(false),
  recycle: z
    .object({
      hunkValue: z.number().int().nonnegative(),
    })
    .optional(),
  runtime: RuntimeRegistrationSchema,
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
  combat: EntityCombatContentSchema.optional(),
  capabilities: EntityCapabilitiesContentSchema.optional(),
  projectile: ProjectileContentSchema.optional(),
  player: z
    .object({
      starterLoadout: PlayerStarterLoadoutSchema.optional(),
      unarmedAttack: JabWeaponContentSchema.optional(),
      passiveHealing: z
        .object({
          outOfCombatTicks: z.number().int().positive(),
          hpPerTick: z.number().finite().positive(),
        })
        .optional(),
    })
    .optional(),
  runtime: RuntimeRegistrationSchema,
  rarityTier: RarityTierSchema.optional(),
  deathLoot: z
    .object({
      // placeholder container for strict enemy death-loot presence
    })
    .optional(),
  spawnWeapons: EnemySpawnWeaponsContentSchema.optional(),
  trap: TrapContentSchema.optional(),
});

export const EffectContentSchema = z.object({
  label: z.string().min(1),
  hint: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  durationTicks: z.number().int().positive().optional(),
  pulseIntervalTicks: z.number().int().positive().optional(),
  pulseDamage: z.number().finite().positive().optional(),
  impulseStrength: z.number().finite().positive().optional(),
  speedMultiplier: z.number().finite().positive().optional(),
  runtime: RuntimeRegistrationSchema,
});

export type AttackStyle = z.infer<typeof AttackStyleSchema>;
export type RarityTier = z.infer<typeof RarityTierSchema>;
export type ItemSpriteRendering = z.infer<typeof ItemSpriteRenderingSchema>;
export type ItemIconRendering = z.infer<typeof ItemIconRenderingSchema>;
export type KatanaComboStabRendering = z.infer<
  typeof KatanaComboStabRenderingSchema
>;
export type ItemRendering = z.infer<typeof ItemRenderingSchema>;
export type SwingComboWeaponContent = z.infer<
  typeof SwingComboWeaponContentSchema
>;
export type WeaponPresentation = z.infer<typeof WeaponPresentationSchema>;
export type ShootWeaponSpecial = z.infer<typeof ShootWeaponSpecialSchema>;
export type ShootWeaponContent = z.infer<typeof ShootWeaponContentSchema>;
export type SwingWeaponContent = z.infer<typeof SwingWeaponContentSchema>;
export type JabWeaponContent = z.infer<typeof JabWeaponContentSchema>;
export type WeaponContent = z.infer<typeof WeaponContentSchema>;
export type ProjectileContent = z.infer<typeof ProjectileContentSchema>;
export type VisibilityBlockerContent = z.infer<
  typeof VisibilityBlockerContentSchema
>;
export type EntityCombatContent = z.infer<typeof EntityCombatContentSchema>;
export type EnemySpawnWeaponsContent = z.infer<
  typeof EnemySpawnWeaponsContentSchema
>;
export type EntityCapabilitiesContent = z.infer<
  typeof EntityCapabilitiesContentSchema
>;
export type ItemRequirement = z.infer<typeof ItemRequirementSchema>;
export type ItemRecipeContent = z.infer<typeof ItemRecipeContentSchema>;
export type TrapEffectContent = z.infer<typeof TrapEffectContentSchema>;
export type TrapContent = z.infer<typeof TrapContentSchema>;
export type PlayerStarterLoadout = z.infer<typeof PlayerStarterLoadoutSchema>;
export type RuntimeServerClassKind = z.infer<
  typeof RuntimeServerClassKindSchema
>;
export type RuntimeRegistration = z.infer<typeof RuntimeRegistrationSchema>;
export type HealingContent = { amount: number };
export type ItemContent = z.infer<typeof ItemContentSchema>;
export type EntityContent = z.infer<typeof EntityContentSchema>;
export type EffectContent = z.infer<typeof EffectContentSchema>;
