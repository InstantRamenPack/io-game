import type { SwingComboWeaponContent } from "@shared/content/schema.ts";

export const KATANA_COMBO_LENGTH = 3;
export const KATANA_STAB_STEP_INDEX = 2;

export function resolveKatanaChainWindowTicks(
  combo: SwingComboWeaponContent,
  cooldownTicks: number,
): number {
  return Math.ceil(combo.chainWindowCooldownMultiplier * cooldownTicks);
}

export function shouldResetKatanaCombo(
  combo: SwingComboWeaponContent,
  cooldownTicks: number,
  lastAttackTick: number | null,
  currentTick: number,
): boolean {
  if (lastAttackTick === null) {
    return false;
  }
  const elapsedTicks = currentTick - lastAttackTick;
  return elapsedTicks > resolveKatanaChainWindowTicks(combo, cooldownTicks);
}

export function shouldResetKatanaComboByMs(
  combo: SwingComboWeaponContent,
  cooldownTicks: number,
  tickRate: number,
  lastAttackMs: number | null,
  nowMs: number,
): boolean {
  if (lastAttackMs === null) {
    return false;
  }
  const cooldownMs = (cooldownTicks * 1000) / tickRate;
  return shouldResetKatanaComboByCooldownMs(
    combo,
    cooldownMs,
    lastAttackMs,
    nowMs,
  );
}

export function shouldResetKatanaComboByCooldownMs(
  combo: SwingComboWeaponContent,
  cooldownDurationMs: number,
  lastAttackMs: number | null,
  nowMs: number,
): boolean {
  if (lastAttackMs === null) {
    return false;
  }
  const chainWindowMs =
    combo.chainWindowCooldownMultiplier * cooldownDurationMs;
  return nowMs - lastAttackMs > chainWindowMs;
}
