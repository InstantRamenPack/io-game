/** Matches the main canopy circle drawn in TreeRenderer. */
export const TREE_CANOPY_RADIUS_SCALE = 0.82;

export function getTreeCanopyRadiusFromHitboxWidth(width: number): number {
  return ((width * Math.SQRT2) / 2) * TREE_CANOPY_RADIUS_SCALE;
}
