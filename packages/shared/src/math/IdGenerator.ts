import { uniqueId } from "lodash-es";

/** Generates monotonic numeric IDs for runtime entities. */
export class IdGenerator {
  /** Allocates a new numeric entity ID. */
  alloc(): number {
    return Number.parseInt(uniqueId(), 10);
  }

  /** Placeholder free API; IDs are not recycled in MVP. */
  free(_entityId: number): void {
    // Intentionally no-op for MVP to avoid ID reuse races in clients.
  }
}
