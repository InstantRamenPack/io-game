import { buildingContentEntries } from "@shared/content/building/index.ts";
import { effectContentEntries } from "@shared/content/effect/index.ts";
import { enemyContentEntries } from "@shared/content/enemy/index.ts";
import { itemContentEntries } from "@shared/content/item/index.ts";
import { pickupContentEntries } from "@shared/content/pickup/index.ts";
import { playerContentEntries } from "@shared/content/player/index.ts";
import { projectileContentEntries } from "@shared/content/projectile/index.ts";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

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

  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key]!)}`)
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
  entries: ReadonlyArray<readonly [string, Record<string, unknown>]>,
): JsonValue[] {
  return [...entries]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([typeId, content]) => ({
      typeId,
      content: content as JsonValue,
    }));
}

const compatManifest = {
  runtimeConfig: ["googleClientId", "compatHash", "tickRate", "worldSize"],
  messages: {
    clientToServer: [
      "hello",
      "move",
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
    items: serializeEntries(itemContentEntries),
    entities: [
      ...serializeEntries(playerContentEntries),
      ...serializeEntries(enemyContentEntries),
      ...serializeEntries(buildingContentEntries),
      ...serializeEntries(projectileContentEntries),
      ...serializeEntries(pickupContentEntries),
    ],
    effects: serializeEntries(effectContentEntries),
  },
} satisfies JsonValue;

export const COMPAT_HASH = hashFnv1a(stableSerialize(compatManifest));
