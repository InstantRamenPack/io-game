export type JsonPrimitive = string | number | boolean | null;

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  if (typeof value !== "object" || value === undefined) {
    return false;
  }

  return Object.values(value).every((entry) => isJsonValue(entry));
}

export function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseJsonValue(rawJson: string): JsonValue | null {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    return isJsonValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
