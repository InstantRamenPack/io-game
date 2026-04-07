import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { CraftingModalEntry } from "@client/render/hud/CraftingModal.ts";
import {
  getItemContent,
  getProjectileContent,
  getResourceDisplayLabel,
  getWeaponContent,
} from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type {
  ActiveEffectSnapshot,
  InventorySlotSnapshot,
} from "@shared/net/snapshots.ts";

export type CombatHudAmmoModel = {
  typeId: ResourceId;
  ammoInMag: number;
  magSize: number;
  reserveMagCount: number | null;
  reloadTicksRemaining: number | null;
};

export type CombatHudModel = {
  hp: number;
  maxHp: number;
  ammo: CombatHudAmmoModel | null;
};

export type HudEffectEntry = {
  typeId: ResourceId;
  label: string;
  secondsRemaining: number;
};

export type HudTooltipContent = {
  title: string;
  detail: string;
  lines: string[];
};

export function buildCombatHudModel(options: {
  playerEntity: ClientEntity | undefined;
  activeSlot: InventorySlotSnapshot | null;
}): CombatHudModel | null {
  const { playerEntity, activeSlot } = options;
  if (!playerEntity) {
    return null;
  }

  return {
    hp: playerEntity.hp ?? 0,
    maxHp: Math.max(0, playerEntity.maxHp ?? 0),
    ammo: buildAmmoModel(activeSlot),
  };
}

export function buildActiveEffectEntries(options: {
  activeEffects: readonly ActiveEffectSnapshot[] | undefined;
  tickRate: number;
}): HudEffectEntry[] {
  const { activeEffects, tickRate } = options;
  return (activeEffects ?? []).map((effect) => ({
    typeId: effect.typeId,
    label: getResourceDisplayLabel(effect.typeId),
    secondsRemaining: effect.ticksRemaining / tickRate,
  }));
}

export function buildInventoryTooltipContent(
  slot: InventorySlotSnapshot,
): HudTooltipContent | null {
  if (slot.kind === "empty") {
    return null;
  }

  const title = getResourceDisplayLabel(slot.typeId);
  const detail = getItemDetailLine(slot.typeId, slot.kind);
  const lines: string[] = [];

  if (slot.kind === "buildable") {
    lines.push(`Stack: ${slot.count}`);
  }

  if (slot.kind === "weapon") {
    lines.push(...buildWeaponStatLines(slot.typeId));
    if (
      typeof slot.ammoInMag === "number" &&
      typeof slot.magSize === "number"
    ) {
      lines.push(`Ammo: ${slot.ammoInMag}/${slot.magSize}`);
    }
    if (typeof slot.reserveMagCount === "number") {
      lines.push(`Mags: ${slot.reserveMagCount}`);
    }
  }

  return {
    title,
    detail,
    lines,
  };
}

export function buildCraftTooltipContent(
  entry: CraftingModalEntry,
): HudTooltipContent {
  return {
    title: entry.label,
    detail: entry.description,
    lines: [`Output: ${entry.outputAmount}`, `Costs: ${entry.costsLabel}`],
  };
}

export function buildSelectedItemLabel(
  slot: InventorySlotSnapshot | null | undefined,
): string {
  if (!slot || slot.kind === "empty") {
    return "Empty";
  }
  return getResourceDisplayLabel(slot.typeId);
}

function buildAmmoModel(
  activeSlot: InventorySlotSnapshot | null,
): CombatHudAmmoModel | null {
  if (
    !activeSlot ||
    activeSlot.kind !== "weapon" ||
    typeof activeSlot.magSize !== "number" ||
    activeSlot.magSize <= 0
  ) {
    return null;
  }

  return {
    typeId: activeSlot.typeId,
    ammoInMag:
      typeof activeSlot.ammoInMag === "number" ? activeSlot.ammoInMag : 0,
    magSize: activeSlot.magSize,
    reserveMagCount:
      typeof activeSlot.reserveMagCount === "number"
        ? activeSlot.reserveMagCount
        : null,
    reloadTicksRemaining:
      typeof activeSlot.reloadTicksRemaining === "number" &&
      activeSlot.reloadTicksRemaining > 0
        ? activeSlot.reloadTicksRemaining
        : null,
  };
}

function getItemDetailLine(
  typeId: ResourceId,
  kind: "weapon" | "buildable",
): string {
  const itemContent = getItemContent(typeId);
  if (itemContent?.description) {
    return itemContent.description;
  }
  if (itemContent?.hint) {
    return itemContent.hint;
  }
  if (itemContent?.recipe?.hint) {
    return itemContent.recipe.hint;
  }

  if (itemContent?.buildsEntityTypeId) {
    return `Places ${getResourceDisplayLabel(itemContent.buildsEntityTypeId)}.`;
  }

  if (kind === "weapon") {
    return "Combat item.";
  }

  return "Carryable item.";
}

function buildWeaponStatLines(typeId: ResourceId): string[] {
  const weaponContent = getWeaponContent(typeId);
  if (!weaponContent) {
    return [];
  }

  switch (weaponContent.attackStyle) {
    case "shoot": {
      const projectileContent = getProjectileContent(
        weaponContent.projectileTypeId,
      );
      return [
        ...(projectileContent
          ? [
              `Damage: ${projectileContent.damage}`,
              `Range: ${projectileContent.range}`,
            ]
          : []),
        `Cooldown: ${weaponContent.cooldownTicks} ticks`,
        `Reload: ${weaponContent.reloadTicks} ticks`,
      ];
    }
    case "swing":
      return [
        `Damage: ${weaponContent.damage}`,
        `Range: ${weaponContent.range}`,
        `Sweep Arc: ${weaponContent.sweepArcDeg}\u00b0`,
        `Cooldown: ${weaponContent.cooldownTicks} ticks`,
      ];
    case "jab":
      return [
        `Damage: ${weaponContent.damage}`,
        `Range: ${weaponContent.range}`,
        `Jab Width: ${weaponContent.jabWidth}`,
        `Cooldown: ${weaponContent.cooldownTicks} ticks`,
      ];
  }
}
