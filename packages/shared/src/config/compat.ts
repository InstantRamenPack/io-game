import { buildingContentEntries } from "@shared/content/building/index.ts";
import { effectContentEntries } from "@shared/content/effect/index.ts";
import { enemyContentEntries } from "@shared/content/enemy/index.ts";
import { itemContentEntries } from "@shared/content/item/index.ts";
import { pickupContentEntries } from "@shared/content/pickup/index.ts";
import { playerContentEntries } from "@shared/content/player/index.ts";
import { projectileContentEntries } from "@shared/content/projectile/index.ts";
import { sortResourceEntriesByTypeId } from "@shared/content/catalog.ts";
import type { JsonObject, JsonValue } from "@shared/json.ts";

function stableSerialize(value: JsonValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  const entries = Object.entries(value)
    .filter((entry): entry is [string, JsonValue] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(",")}}`;
}

function hashFnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function serializeEntries(
  entries: ReadonlyArray<readonly [string, JsonObject]>,
): JsonValue[] {
  return entries.map(([typeId, content]) => ({
    typeId,
    content,
  }));
}

const compatManifest = {
  runtimeConfig: [
    "googleClientId",
    "compatHash",
    "tickRate",
    "worldSize",
    "interpolation",
  ],
  messages: {
    clientToServer: [
      "hello",
      "move",
      "aim",
      "action:attack",
      "action:craft",
      "action:build",
      "action:inventoryMove",
      "action:selectHotbar",
      "respawn",
      "ping",
      "chat",
    ],
    serverToClient: ["welcome", "snapshot", "pong", "error", "chat"],
  },
  events: ["damage", "explosion"],
  snapshots: {
    entityBase: [
      "id",
      "kind",
      "typeId",
      "x",
      "y",
      "vx",
      "vy",
      "rotation",
      "hitboxes",
      "hp",
      "maxHp",
      "alive",
      "ownerId",
    ],
    equippedItem: [
      "typeId",
      "attackStyle",
      "cooldownTicksRemaining",
      "ammoInMag",
      "magSize",
      "reserveMagCount",
      "reloadTicks",
      "reloadTicksRemaining",
    ],
    player: ["name", "inventory", "activeEffects", "moveSpeed", "equippedItem"],
    enemy: ["targetId", "equippedItem"],
    building: ["label", "tier"],
    pickup: ["inventory"],
    world: ["tick", "dayNight", "entities", "events"],
  },
  content: {
    items: serializeEntries(sortResourceEntriesByTypeId(itemContentEntries)),
    entities: [
      ...serializeEntries(sortResourceEntriesByTypeId(playerContentEntries)),
      ...serializeEntries(sortResourceEntriesByTypeId(enemyContentEntries)),
      ...serializeEntries(sortResourceEntriesByTypeId(buildingContentEntries)),
      ...serializeEntries(
        sortResourceEntriesByTypeId(projectileContentEntries),
      ),
      ...serializeEntries(sortResourceEntriesByTypeId(pickupContentEntries)),
    ],
    effects: serializeEntries(
      sortResourceEntriesByTypeId(effectContentEntries),
    ),
  },
} satisfies JsonValue;

export const COMPAT_HASH = hashFnv1a(stableSerialize(compatManifest));
