import type { EntityKind } from "@shared/content/schema.ts";
import { makeResourceId, type ResourceId } from "@shared/ids/ResourceId.ts";

type RuntimeTypeKind = EntityKind | "item" | "effect";

export type DerivableTypeStatic<K extends RuntimeTypeKind = RuntimeTypeKind> = {
  readonly kind: K;
  readonly resourceName: string;
};

export type EntityClassMetadata<K extends EntityKind = EntityKind> =
  DerivableTypeStatic<K>;

export type ItemClassMetadata = DerivableTypeStatic<"item">;

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
  return makeResourceId(
    metadata.kind,
    assertResourceName(metadata.resourceName),
  );
}
