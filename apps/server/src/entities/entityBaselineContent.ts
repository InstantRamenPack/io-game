import { requireEntityContent } from "@shared/content/catalog.ts";
import type {
  CollisionMode,
  EntityCombatContent,
  EntityContent,
} from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

type EntityHitboxProfiles = NonNullable<EntityContent["hitboxProfiles"]>;

export type EntityBaselineContent = {
  label: string;
  maxHp: number;
  collisionMode: CollisionMode;
  moveSpeed?: number;
  hitboxProfiles?: EntityHitboxProfiles;
  activeHitboxProfile?: string;
  combat: EntityCombatContent;
};

export type MovingEntityBaselineContent = EntityBaselineContent & {
  moveSpeed: number;
};

export type HitboxEntityBaselineContent = EntityBaselineContent & {
  hitboxProfiles: EntityHitboxProfiles;
};

function requireEntityContentField<
  TField extends keyof EntityContent,
  TValue extends NonNullable<EntityContent[TField]>,
>(typeId: ResourceId, fieldName: TField): TValue {
  const content = requireEntityContent(typeId);
  const value = content[fieldName];
  if (value === undefined) {
    throw new Error(
      `Missing entity content field ${String(fieldName)} for ${typeId}.`,
    );
  }
  return value as TValue;
}

export function requireEntityBaselineContent(
  typeId: ResourceId,
): EntityBaselineContent {
  return {
    label: requireEntityContentField(typeId, "label"),
    maxHp: requireEntityContentField(typeId, "maxHp"),
    collisionMode: requireEntityContentField(typeId, "collisionMode"),
    moveSpeed: requireEntityContent(typeId).moveSpeed,
    hitboxProfiles: requireEntityContent(typeId).hitboxProfiles,
    activeHitboxProfile: requireEntityContent(typeId).activeHitboxProfile,
    combat: requireEntityContent(typeId).combat ?? {
      damageMultiplier: 1,
      attackMinIntervalTicks: 0,
    },
  };
}

export function requireMovingEntityBaselineContent(
  typeId: ResourceId,
): MovingEntityBaselineContent {
  return {
    ...requireEntityBaselineContent(typeId),
    moveSpeed: requireEntityContentField(typeId, "moveSpeed"),
  };
}

export function requireHitboxEntityBaselineContent(
  typeId: ResourceId,
): HitboxEntityBaselineContent {
  return {
    ...requireEntityBaselineContent(typeId),
    hitboxProfiles: requireEntityContentField(typeId, "hitboxProfiles"),
  };
}
