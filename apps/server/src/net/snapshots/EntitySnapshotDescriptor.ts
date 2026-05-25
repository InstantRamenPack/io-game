import type { Entity } from "@server/entities/Entity.ts";
import type { HitboxRect } from "@shared/geometry/hitbox.ts";
import type {
  EntitySnapshot,
  EquippedItemSnapshot,
} from "@shared/net/snapshots.ts";

type FingerprintPart = number | string;

type BaseFieldDescriptor = {
  readonly key: keyof EntitySnapshot | "hitboxes";
  readonly stripWhenStable?: boolean;
  readonly snapshotPart: (snapshot: EntitySnapshot) => FingerprintPart;
  readonly runtimePart: (
    entity: Entity,
    hitboxFingerprint: string,
  ) => FingerprintPart;
};

const BASE_FIELD_DESCRIPTORS: readonly BaseFieldDescriptor[] = [
  {
    key: "id",
    snapshotPart: (snapshot) => snapshot.id,
    runtimePart: (entity) => entity.id,
  },
  {
    key: "kind",
    snapshotPart: (snapshot) => snapshot.kind,
    runtimePart: (entity) => {
      const ctor = entity.constructor as typeof Entity & {
        readonly kind?: string;
      };
      return ctor.kind ?? entity.constructor.name;
    },
  },
  {
    key: "typeId",
    stripWhenStable: true,
    snapshotPart: (snapshot) => snapshot.typeId ?? "",
    runtimePart: (entity) => entity.typeId,
  },
  {
    key: "x",
    snapshotPart: (snapshot) => snapshot.x,
    runtimePart: (entity) => entity.x,
  },
  {
    key: "y",
    snapshotPart: (snapshot) => snapshot.y,
    runtimePart: (entity) => entity.y,
  },
  {
    key: "vx",
    snapshotPart: (snapshot) => snapshot.vx,
    runtimePart: (entity) => entity.vx,
  },
  {
    key: "vy",
    snapshotPart: (snapshot) => snapshot.vy,
    runtimePart: (entity) => entity.vy,
  },
  {
    key: "rotation",
    snapshotPart: (snapshot) => snapshot.rotation,
    runtimePart: (entity) => entity.rotation,
  },
  {
    key: "hp",
    stripWhenStable: true,
    snapshotPart: (snapshot) => snapshot.hp ?? "",
    runtimePart: (entity) => entity.hp,
  },
  {
    key: "maxHp",
    stripWhenStable: true,
    snapshotPart: (snapshot) => snapshot.maxHp ?? "",
    runtimePart: (entity) => entity.maxHp,
  },
  {
    key: "alive",
    stripWhenStable: true,
    snapshotPart: (snapshot) =>
      snapshot.alive === undefined ? "" : snapshot.alive ? 1 : 0,
    runtimePart: (entity) => (entity.alive ? 1 : 0),
  },
  {
    key: "ownerId",
    stripWhenStable: true,
    snapshotPart: (snapshot) => snapshot.ownerId ?? "",
    runtimePart: (entity) => entity.ownerId ?? "",
  },
  {
    key: "hitboxes",
    snapshotPart: (snapshot) =>
      snapshot.hitboxes ? getHitboxFingerprint(snapshot.hitboxes) : "",
    runtimePart: (_entity, hitboxFingerprint) => hitboxFingerprint,
  },
];

export function getEntitySnapshotBaseFingerprintParts(
  snapshot: EntitySnapshot,
): FingerprintPart[] {
  return BASE_FIELD_DESCRIPTORS.map((descriptor) =>
    descriptor.snapshotPart(snapshot),
  );
}

export function getEntityRuntimeBaseFingerprintParts(
  entity: Entity,
  hitboxFingerprint: string,
): FingerprintPart[] {
  return BASE_FIELD_DESCRIPTORS.map((descriptor) =>
    descriptor.runtimePart(entity, hitboxFingerprint),
  );
}

export function stripKnownStableEntitySnapshotFields(
  snapshot: EntitySnapshot,
  knownSnapshot: EntitySnapshot,
): EntitySnapshot {
  const deltaSnapshot = { ...snapshot };
  delete deltaSnapshot.hitboxes;

  for (const descriptor of BASE_FIELD_DESCRIPTORS) {
    if (
      descriptor.stripWhenStable &&
      snapshot[descriptor.key] === knownSnapshot[descriptor.key]
    ) {
      delete deltaSnapshot[descriptor.key];
    }
  }

  if (deltaSnapshot.kind === "enemy" && knownSnapshot.kind === "enemy") {
    if (deltaSnapshot.targetId === knownSnapshot.targetId) {
      delete deltaSnapshot.targetId;
    }
    if (
      getEquippedItemSnapshotFingerprint(deltaSnapshot.equippedItem) ===
      getEquippedItemSnapshotFingerprint(knownSnapshot.equippedItem)
    ) {
      delete deltaSnapshot.equippedItem;
    }
    if (deltaSnapshot.armorTypeId === knownSnapshot.armorTypeId) {
      delete deltaSnapshot.armorTypeId;
    }
    if (deltaSnapshot.armorTier === knownSnapshot.armorTier) {
      delete deltaSnapshot.armorTier;
    }
    if (
      deltaSnapshot.armorDamageReductionPct ===
      knownSnapshot.armorDamageReductionPct
    ) {
      delete deltaSnapshot.armorDamageReductionPct;
    }
  }

  return deltaSnapshot as EntitySnapshot;
}

export function getHitboxFingerprint(hitboxes: readonly HitboxRect[]): string {
  return hitboxes
    .map((hitbox) =>
      [hitbox.offsetX, hitbox.offsetY, hitbox.width, hitbox.height].join(","),
    )
    .join(";");
}

export function getEquippedItemSnapshotFingerprint(
  equippedItem: EquippedItemSnapshot | undefined,
): string {
  if (!equippedItem) {
    return "";
  }

  return [
    equippedItem.typeId,
    equippedItem.attackStyle,
    equippedItem.cooldownTicksRemaining,
    equippedItem.ammoInMag ?? "",
    equippedItem.magSize ?? "",
    equippedItem.reserveMagCount ?? "",
    equippedItem.reloadTicks ?? "",
    equippedItem.reloadTicksRemaining ?? "",
  ].join(",");
}
