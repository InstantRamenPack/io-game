export type CombatTeam = "player" | "enemy" | "environment";

export function canTeamDamage(
  attacker: CombatTeam,
  defender: CombatTeam,
): boolean {
  if (attacker === "player") {
    return defender === "player" || defender === "enemy";
  }
  if (attacker === "enemy") {
    return defender === "player";
  }
  if (attacker === "environment") {
    return defender === "player";
  }
  return false;
}
