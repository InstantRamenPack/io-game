import seedrandom from "seedrandom";
import { getAllEntityContentEntries } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type WorldGenLegendaryBossPlacements = {
  dungeon: ResourceId;
  extraction: ResourceId;
};

let cachedLegendaryBossTypeIds: readonly ResourceId[] | null = null;

export function getLegendaryBossTypeIds(): readonly ResourceId[] {
  if (cachedLegendaryBossTypeIds === null) {
    cachedLegendaryBossTypeIds = getAllEntityContentEntries()
      .filter(
        ([typeId, content]) =>
          typeId.startsWith("enemy:") &&
          typeId !== "enemy:crate" &&
          content.rarityTier === "legendary",
      )
      .map(([typeId]) => typeId);
  }
  return cachedLegendaryBossTypeIds;
}

export function isLegendaryBossTypeId(typeId: ResourceId): boolean {
  return getLegendaryBossTypeIds().includes(typeId);
}

export function resolveWorldGenLegendaryBossPlacements(
  seed: number,
): WorldGenLegendaryBossPlacements {
  const pool = [...getLegendaryBossTypeIds()];
  if (pool.length === 0) {
    throw new Error(
      "No legendary-tier enemies are defined in content for world generation.",
    );
  }
  const rng = seedrandom(`${seed}:legendary-bosses`);
  return {
    dungeon: pool[Math.floor(rng() * pool.length)]!,
    extraction: pool[Math.floor(rng() * pool.length)]!,
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
