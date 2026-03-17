export type ResourceId = `${string}:${string}`;

export const RESOURCE_ID_PATTERN =
  /^[a-z][a-z0-9_-]*:[a-z0-9_./-]+$/;

/**
 * Returns whether a string matches the shared namespace:path identifier format.
 * @param value Candidate resource id.
 * @returns True when the value is a valid resource id.
 */
export function isResourceId(value: string): value is ResourceId {
  return RESOURCE_ID_PATTERN.test(value);
}

/**
 * Asserts that a string matches the shared namespace:path identifier format.
 * @param value Candidate resource id.
 * @returns The validated resource id.
 */
export function assertResourceId(value: string): ResourceId {
  if (!isResourceId(value)) {
    throw new Error(`Invalid resource id: ${value}`);
  }
  return value;
}

/**
 * Extracts the namespace portion of a resource id.
 * @param typeId Resource id value.
 * @returns Namespace before the first colon, or an empty string when malformed.
 */
export function getResourceNamespace(typeId: string): string {
  const separatorIndex = typeId.indexOf(":");
  return separatorIndex >= 0 ? typeId.slice(0, separatorIndex) : "";
}
