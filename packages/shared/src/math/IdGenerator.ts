import { uniqueId } from "lodash-es";

/**
 * Generates monotonic numeric ids for runtime entities.
 * The server remains the source of truth for all allocated ids.
 */
export class IdGenerator {
  /**
   * Allocates a new runtime entity id.
   * @returns Newly allocated numeric id.
   */
  public alloc(): number {
    return Number.parseInt(uniqueId(), 10);
  }

  /**
   * Placeholder release hook for future id recycling.
   * @param _entityId Entity id that would be released if recycling is enabled later.
   */
  public free(_entityId: number): void {
    // Intentionally no-op for MVP to avoid ID reuse races in clients.
  }
}
