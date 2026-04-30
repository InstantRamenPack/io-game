const PLAYER_SPAWN_OFFSET_Y = 100;

export function getPlayerSpawnPosition(worldSize: { w: number; h: number }): {
  x: number;
  y: number;
} {
  return {
    x: worldSize.w / 2,
    y: worldSize.h / 2 + PLAYER_SPAWN_OFFSET_Y,
  };
}
