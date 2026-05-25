import { getArmorContent } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type ArmorTier = 1 | 2 | 3 | 4;

export type ArmorStats = {
  typeId: ResourceId;
  tier: ArmorTier;
  damageReductionPct: number;
  reflectDamagePct: number;
};

export function getArmorStats(typeId: ResourceId): ArmorStats | null {
  const content = getArmorContent(typeId);
  if (!content) {
    return null;
  }
  return {
    typeId,
    tier: content.tier,
    damageReductionPct: content.damageReductionPct,
    reflectDamagePct: content.reflectDamagePct,
  };
}
