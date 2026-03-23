import type { EntityKind } from "@shared/content/schema.ts";
import { makeResourceId, type ResourceId } from "@shared/ids/ResourceId.ts";

export type RuntimeTypeKind = EntityKind | "item" | "effect";

export type DerivableTypeStatic<K extends RuntimeTypeKind = RuntimeTypeKind> = {
  readonly kind: K;
  readonly resourceName: string;
};

export type EntityClassMetadata<K extends EntityKind = EntityKind> =
  DerivableTypeStatic<K>;

export type ItemClassMetadata = DerivableTypeStatic<"item"> & {
  readonly stackMax: number;
  readonly buildingTypeId?: ResourceId;
};

export type EffectClassMetadata = DerivableTypeStatic<"effect">;

function assertResourceName(resourceName: string): string {
  if (!resourceName.trim()) {
    throw new Error("Expected a non-empty resourceName on registrable class.");
  }
  return resourceName;
}

export function deriveTypeIdFromStaticMetadata(
  metadata: DerivableTypeStatic,
): ResourceId {
  return makeResourceId(metadata.kind, assertResourceName(metadata.resourceName));
}

export function requireEntityClassMetadata(
  metadata: Partial<EntityClassMetadata>,
): EntityClassMetadata {
  if (!metadata.kind) {
    throw new Error("Expected registrable entity class to declare static kind.");
  }
  return {
    kind: metadata.kind,
    resourceName: assertResourceName(metadata.resourceName ?? ""),
  };
}

export function requireItemClassMetadata(
  metadata: Partial<ItemClassMetadata>,
): ItemClassMetadata {
  if (metadata.kind !== "item") {
    throw new Error("Expected registrable item class to declare static kind 'item'.");
  }
  if (typeof metadata.stackMax !== "number" || metadata.stackMax < 1) {
    throw new Error(
      "Expected registrable item class to declare a positive static stackMax.",
    );
  }
  return {
    kind: "item",
    resourceName: assertResourceName(metadata.resourceName ?? ""),
    stackMax: metadata.stackMax,
    buildingTypeId: metadata.buildingTypeId,
  };
}

export function requireEffectClassMetadata(
  metadata: Partial<EffectClassMetadata>,
): EffectClassMetadata {
  if (metadata.kind !== "effect") {
    throw new Error(
      "Expected registrable effect class to declare static kind 'effect'.",
    );
  }
  return {
    kind: "effect",
    resourceName: assertResourceName(metadata.resourceName ?? ""),
  };
}
