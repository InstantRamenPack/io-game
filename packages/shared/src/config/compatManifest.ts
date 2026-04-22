import { CLIENT_RUNTIME_CONFIG_COMPAT_DESCRIPTOR } from "@shared/config/ClientRuntimeConfig.ts";
import { CONTENT_COMPAT_DESCRIPTOR } from "@shared/content/catalog.ts";
import type { JsonObject, JsonValue } from "@shared/json.ts";
import { NET_EVENT_TYPES } from "@shared/net/events.ts";
import { PROTOCOL_COMPAT_DESCRIPTOR } from "@shared/net/protocol.ts";
import { SNAPSHOT_COMPAT_DESCRIPTOR } from "@shared/net/snapshots.ts";

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

export const COMPAT_MANIFEST: JsonObject = {
  runtimeConfig: [...CLIENT_RUNTIME_CONFIG_COMPAT_DESCRIPTOR],
  messages: {
    clientToServer: [...PROTOCOL_COMPAT_DESCRIPTOR.clientToServer],
    serverToClient: [...PROTOCOL_COMPAT_DESCRIPTOR.serverToClient],
  },
  events: [...NET_EVENT_TYPES],
  snapshots: {
    entityBase: [...SNAPSHOT_COMPAT_DESCRIPTOR.entityBase],
    equippedItem: [...SNAPSHOT_COMPAT_DESCRIPTOR.equippedItem],
    player: [...SNAPSHOT_COMPAT_DESCRIPTOR.player],
    enemy: [...SNAPSHOT_COMPAT_DESCRIPTOR.enemy],
    building: [...SNAPSHOT_COMPAT_DESCRIPTOR.building],
    pickup: [...SNAPSHOT_COMPAT_DESCRIPTOR.pickup],
    world: [...SNAPSHOT_COMPAT_DESCRIPTOR.world],
  },
  content: CONTENT_COMPAT_DESCRIPTOR,
};

export const COMPAT_HASH = hashFnv1a(stableSerialize(COMPAT_MANIFEST));
