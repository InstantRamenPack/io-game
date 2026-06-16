import { ContentBlueprintItem } from "@server/items/ContentBlueprintItem.ts";
import { ContentMagazineItem } from "@server/items/ContentMagazineItem.ts";
import { MaterialItem } from "@server/items/MaterialItem.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import { StructureItem } from "@server/items/StructureItem.ts";
import { ArmorItem } from "@server/items/armor/ArmorItem.ts";
import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import type {
  RegistrableBlueprintCtor,
  RegistrableItemCtor,
  RegistrableMagCtor,
} from "@server/registry/registries.ts";

const magCtorCache = new Map<string, RegistrableMagCtor>();
const blueprintCtorCache = new Map<string, RegistrableBlueprintCtor>();
const itemCtorCache = new Map<string, RegistrableItemCtor>();

export function createItemLikeCtor(
  kind: "mag",
  resourceName: string,
): RegistrableMagCtor;
export function createItemLikeCtor(
  kind: "blueprint",
  resourceName: string,
): RegistrableBlueprintCtor;
export function createItemLikeCtor(
  kind: "armor" | "material" | "structure" | "rangedWeapon",
  resourceName: string,
): RegistrableItemCtor;
export function createItemLikeCtor(
  kind:
    | "mag"
    | "blueprint"
    | "armor"
    | "material"
    | "structure"
    | "rangedWeapon",
  resourceName: string,
): RegistrableMagCtor | RegistrableBlueprintCtor | RegistrableItemCtor {
  if (kind === "mag") {
    const cached = magCtorCache.get(resourceName);
    if (cached) {
      return cached;
    }

    class GeneratedMagazineItem extends ContentMagazineItem {
      public static override readonly resourceName = resourceName;
    }

    magCtorCache.set(resourceName, GeneratedMagazineItem);
    return GeneratedMagazineItem;
  }

  if (kind !== "blueprint") {
    const cacheKey = `${kind}:${resourceName}`;
    const cached = itemCtorCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (kind === "rangedWeapon") {
      class GeneratedRangedWeapon extends RangedWeapon {
        public static override readonly kind = "item" as const;
        public static override readonly resourceName = resourceName;

        constructor() {
          const weaponContent = requireShootWeaponRuntime(
            GeneratedRangedWeapon.typeId,
          );
          super(
            weaponContent.cooldownTicks,
            weaponContent.projectileTypeId,
            weaponContent.magSize,
            weaponContent.reloadTicks,
            weaponContent.spreadDeg,
            weaponContent.magItemTypeId,
          );
        }
      }

      itemCtorCache.set(cacheKey, GeneratedRangedWeapon);
      return GeneratedRangedWeapon;
    }

    const BaseItem =
      kind === "armor"
        ? ArmorItem
        : kind === "structure"
          ? StructureItem
          : MaterialItem;

    class GeneratedItem extends BaseItem {
      public static override readonly kind = "item" as const;
      public static override readonly resourceName = resourceName;
    }

    itemCtorCache.set(cacheKey, GeneratedItem);
    return GeneratedItem;
  }

  const cached = blueprintCtorCache.get(resourceName);
  if (cached) {
    return cached;
  }

  class GeneratedBlueprintItem extends ContentBlueprintItem {
    public static override readonly resourceName = resourceName;
  }

  blueprintCtorCache.set(resourceName, GeneratedBlueprintItem);
  return GeneratedBlueprintItem;
}
