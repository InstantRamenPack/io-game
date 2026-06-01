import type { ProceduralWorldLayout } from "@shared/world/ProceduralWorld.ts";

const PLAYER_SPAWN_OFFSET_Y = 100;
const MATCH_BASE_SPAWN_OFFSETS = Object.freeze([
  { x: 0, y: 0 },
  { x: -120, y: 0 },
  { x: 120, y: 0 },
  { x: -240, y: -40 },
  { x: 240, y: -40 },
]);

export function getPlayerSpawnPosition(worldSize: { w: number; h: number }): {
  x: number;
  y: number;
} {
  return {
    x: worldSize.w / 2,
    y: worldSize.h / 2 + PLAYER_SPAWN_OFFSET_Y,
  };
}

export function getMatchPlayerSpawnPosition(
  worldSize: { w: number; h: number },
  proceduralLayout: ProceduralWorldLayout | null,
  spawnSlot = 0,
): {
  x: number;
  y: number;
} {
  const fallback = getPlayerSpawnPosition(worldSize);
  if (!proceduralLayout) {
    return fallback;
  }

  const centerX =
    (proceduralLayout.homeBounds.minX + proceduralLayout.homeBounds.maxX) / 2;
  const centerY =
    (proceduralLayout.homeBounds.minY + proceduralLayout.homeBounds.maxY) / 2;
  const slot = MATCH_BASE_SPAWN_OFFSETS[
    Math.max(0, spawnSlot) % MATCH_BASE_SPAWN_OFFSETS.length
  ] ?? { x: 0, y: 0 };
  return {
    x: centerX + slot.x,
    y: centerY + slot.y,
  };
}
