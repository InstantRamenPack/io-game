import type { GameSelectors } from "@client/app/gameSelectors.ts";
import { BUILDABLE_ITEM_TYPE_IDS } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { HotbarSlotItem } from "@client/render/hud/HotbarView.ts";

export type HotbarEntry =
  | {
      kind: "weapon";
      typeId: ResourceId;
      weaponIndex: number;
      ammoInMag: number | null;
      magSize: number | null;
      reloadTicks: number | null;
      reloadTicksRemaining: number | null;
    }
  | {
      kind: "buildable";
      typeId: ResourceId;
      count: number;
      showCountWhenOne: true;
    };

export function resolveHotbarEntries(
  selectors: GameSelectors,
  slotCount: number,
): HotbarEntry[] {
  const inventory = selectors.getInventory();
  if (!inventory) {
    return [];
  }

  const hotbarEntries: HotbarEntry[] = [];
  inventory.weapons.forEach((weapon, weaponIndex) => {
    hotbarEntries.push({
      kind: "weapon",
      typeId: weapon.typeId,
      weaponIndex,
      ammoInMag:
        typeof weapon.ammoInMag === "number" ? weapon.ammoInMag : null,
      magSize: typeof weapon.magSize === "number" ? weapon.magSize : null,
      reloadTicks:
        typeof weapon.reloadTicks === "number" ? weapon.reloadTicks : null,
      reloadTicksRemaining:
        typeof weapon.reloadTicksRemaining === "number"
          ? weapon.reloadTicksRemaining
          : null,
    });
  });

  for (const itemTypeId of BUILDABLE_ITEM_TYPE_IDS) {
    hotbarEntries.push({
      kind: "buildable",
      typeId: itemTypeId,
      count: selectors.countInventoryType(itemTypeId),
      showCountWhenOne: true,
    });
  }

  return hotbarEntries.slice(0, slotCount);
}

export function syncActiveBuildSelection(
  state: {
    selectedHotbarSlot: number | null;
    activeBuildItemTypeId: ResourceId | null;
  },
  hotbarEntries: HotbarEntry[],
): void {
  const activeBuildItemTypeId = state.activeBuildItemTypeId;
  if (!activeBuildItemTypeId) {
    return;
  }

  const stillPresent = hotbarEntries.some(
    (entry) =>
      entry.kind === "buildable" &&
      entry.typeId === activeBuildItemTypeId &&
      entry.count > 0,
  );
  if (stillPresent) {
    return;
  }

  state.activeBuildItemTypeId = null;
  if (
    state.selectedHotbarSlot !== null &&
    state.selectedHotbarSlot >= hotbarEntries.length
  ) {
    state.selectedHotbarSlot = null;
  }
}

export function computeHotbarActiveIndex(options: {
  hotbarEntries: HotbarEntry[];
  selectedHotbarSlot: number | null;
  activeBuildItemTypeId: ResourceId | null;
  activeWeaponIndex: number | null;
  pendingWeaponIndex: number | undefined;
}): number | null {
  const {
    hotbarEntries,
    selectedHotbarSlot,
    activeBuildItemTypeId,
    activeWeaponIndex,
    pendingWeaponIndex,
  } = options;

  if (activeBuildItemTypeId) {
    const buildableIndex = hotbarEntries.findIndex(
      (entry) =>
        entry.kind === "buildable" &&
        entry.typeId === activeBuildItemTypeId &&
        entry.count > 0,
    );
    if (buildableIndex >= 0) {
      return buildableIndex;
    }
  }

  if (
    selectedHotbarSlot !== null &&
    selectedHotbarSlot >= 0 &&
    selectedHotbarSlot < hotbarEntries.length &&
    hotbarEntries[selectedHotbarSlot]?.kind === "buildable"
  ) {
    return selectedHotbarSlot;
  }

  const weaponIndex =
    typeof pendingWeaponIndex === "number"
      ? pendingWeaponIndex
      : activeWeaponIndex;
  if (weaponIndex !== null) {
    const activeWeaponSlot = hotbarEntries.findIndex(
      (entry) => entry.kind === "weapon" && entry.weaponIndex === weaponIndex,
    );
    if (activeWeaponSlot >= 0) {
      return activeWeaponSlot;
    }
  }

  if (
    selectedHotbarSlot !== null &&
    selectedHotbarSlot >= 0 &&
    selectedHotbarSlot < hotbarEntries.length
  ) {
    return selectedHotbarSlot;
  }

  return null;
}

export function toHotbarSlotItems(
  hotbarEntries: HotbarEntry[],
  slotCount: number,
): HotbarSlotItem[] {
  return Array.from({ length: slotCount }, (_, index) => {
    const entry = hotbarEntries[index];
    if (!entry) {
      return {
        typeId: null,
        count: null,
        showCountWhenOne: false,
        ammoFillRatio: null,
      } satisfies HotbarSlotItem;
    }

    return {
      typeId:
        entry.kind === "buildable" && entry.count <= 0 ? null : entry.typeId,
      count:
        entry.kind === "buildable" && entry.count <= 0 ? null : entry.count,
      showCountWhenOne:
        entry.kind === "buildable" ? entry.showCountWhenOne : false,
      ammoFillRatio:
        entry.kind === "weapon" ? getWeaponAmmoFillRatio(entry) : null,
    } satisfies HotbarSlotItem;
  });
}

function getWeaponAmmoFillRatio(
  entry: Extract<HotbarEntry, { kind: "weapon" }>,
): number | null {
  if (entry.magSize === null || entry.magSize <= 0) {
    return null;
  }

  if (
    entry.reloadTicksRemaining !== null &&
    entry.reloadTicksRemaining > 0 &&
    entry.reloadTicks !== null &&
    entry.reloadTicks > 0
  ) {
    return 1 - entry.reloadTicksRemaining / entry.reloadTicks;
  }

  if (entry.ammoInMag === null) {
    return null;
  }

  return entry.ammoInMag / entry.magSize;
}
