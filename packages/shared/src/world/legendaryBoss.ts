import { getAllEntityContentEntries } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type WorldGenLegendaryBossPlacements = {
  dungeon: ResourceId;
  extraction: ResourceId;
};

/** Dungeon world-gen boss (boss room). */
export const DUNGEON_LEGENDARY_BOSS_TYPE_ID = "enemy:wither" as ResourceId;

/** Extraction helipad boss; spawned when night cycle reaches the final tier floor. */
export const EXTRACTION_LEGENDARY_BOSS_TYPE_ID = "enemy:thanos" as ResourceId;

let cachedLegendaryBossTypeIds: readonly ResourceId[] | null = null;

export function getLegendaryBossTypeIds(): readonly ResourceId[] {
  if (cachedLegendaryBossTypeIds === null) {
    cachedLegendaryBossTypeIds = getAllEntityContentEntries()
      .filter(
        ([typeId, content]) =>
          typeId.startsWith("enemy:") && content.rarityTier === "legendary",
      )
      .map(([typeId]) => typeId);
  }
  return cachedLegendaryBossTypeIds;
}

export function isLegendaryBossTypeId(typeId: ResourceId): boolean {
  return getLegendaryBossTypeIds().includes(typeId);
}

export function resolveWorldGenLegendaryBossPlacements(
  _seed: number,
): WorldGenLegendaryBossPlacements {
  const pool = new Set(getLegendaryBossTypeIds());
  if (pool.size === 0) {
    throw new Error(
      "No legendary-tier enemies are defined in content for world generation.",
    );
  }
  if (!pool.has(DUNGEON_LEGENDARY_BOSS_TYPE_ID)) {
    throw new Error(
      `Dungeon legendary boss ${DUNGEON_LEGENDARY_BOSS_TYPE_ID} is missing from content.`,
    );
  }
  if (!pool.has(EXTRACTION_LEGENDARY_BOSS_TYPE_ID)) {
    throw new Error(
      `Extraction legendary boss ${EXTRACTION_LEGENDARY_BOSS_TYPE_ID} is missing from content.`,
    );
  }
  return {
    dungeon: DUNGEON_LEGENDARY_BOSS_TYPE_ID,
    extraction: EXTRACTION_LEGENDARY_BOSS_TYPE_ID,
  };
}

export function countLegendaryBossSpawns(
  enemies: readonly { typeId: string }[],
): number {
  const legendaryBossIds = new Set(getLegendaryBossTypeIds());
  return enemies.filter((enemy) =>
    legendaryBossIds.has(enemy.typeId as ResourceId),
  ).length;
}
