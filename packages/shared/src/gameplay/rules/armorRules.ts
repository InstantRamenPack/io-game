import { getArmorContent } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type ArmorTier = 1 | 2 | 3 | 4;

export type ArmorStats = {
  typeId: ResourceId;
  tier: ArmorTier;
  armorBars: number;
  effectiveHealthIncreasePct: number;
  damageMultiplier: number;
  damageReductionPct: number;
  reflectDamagePct: number;
};

export const EFFECTIVE_HEALTH_INCREASE_PER_ARMOR_BAR = 0.25;

export function getArmorStats(typeId: ResourceId): ArmorStats | null {
  const content = getArmorContent(typeId);
  if (!content) {
    return null;
  }
  const effectiveHealthIncreasePct =
    content.armorBars * EFFECTIVE_HEALTH_INCREASE_PER_ARMOR_BAR;
  const damageMultiplier = 1 / (1 + effectiveHealthIncreasePct);
  return {
    typeId,
    tier: content.tier,
    armorBars: content.armorBars,
    effectiveHealthIncreasePct,
    damageMultiplier,
    damageReductionPct: 1 - damageMultiplier,
    reflectDamagePct: content.reflectDamagePct,
  };
}
