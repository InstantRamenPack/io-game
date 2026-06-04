import { ContentBlueprintItem } from "@server/items/ContentBlueprintItem.ts";
import { ContentMagazineItem } from "@server/items/ContentMagazineItem.ts";
import type {
  RegistrableBlueprintCtor,
  RegistrableMagCtor,
} from "@server/registry/registries.ts";

const magCtorCache = new Map<string, RegistrableMagCtor>();
const blueprintCtorCache = new Map<string, RegistrableBlueprintCtor>();

export function createItemLikeCtor(
  kind: "mag",
  resourceName: string,
): RegistrableMagCtor;
export function createItemLikeCtor(
  kind: "blueprint",
  resourceName: string,
): RegistrableBlueprintCtor;
export function createItemLikeCtor(
  kind: "mag" | "blueprint",
  resourceName: string,
): RegistrableMagCtor | RegistrableBlueprintCtor {
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
