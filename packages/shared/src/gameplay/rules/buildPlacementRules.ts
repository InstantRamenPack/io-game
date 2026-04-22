import { BUILD_PLACEMENT_MAX_DISTANCE } from "@shared/gameplay/constants.ts";
import type {
  BuildPlacementRuleInput,
  BuildPlacementRuleResult,
} from "@shared/gameplay/rules/types.ts";

export function measureBuildPlacementDistance(
  input: Omit<BuildPlacementRuleInput, "maxDistance">,
): number {
  return Math.hypot(
    input.targetX - input.playerX,
    input.targetY - input.playerY,
  );
}

export function evaluateBuildPlacementRange(
  input: BuildPlacementRuleInput,
): BuildPlacementRuleResult {
  const distance = measureBuildPlacementDistance(input);
  if (distance > input.maxDistance) {
    return {
      ok: false,
      distance,
      reason: "out_of_range",
    };
  }

  return {
    ok: true,
    distance,
  };
}

export function isBuildPlacementWithinDefaultRange(
  input: Omit<BuildPlacementRuleInput, "maxDistance">,
): boolean {
  return evaluateBuildPlacementRange({
    ...input,
    maxDistance: BUILD_PLACEMENT_MAX_DISTANCE,
  }).ok;
}
