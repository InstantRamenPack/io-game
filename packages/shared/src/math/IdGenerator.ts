/**
 * Generates monotonic numeric ids for runtime entities.
 * The server remains the source of truth for all allocated ids.
 */
export class IdGenerator {
  private nextId = 1;

  /**
   * Allocates a new runtime entity id.
   * @returns Newly allocated numeric id.
   */
  public alloc(): number {
    const allocatedId = this.nextId;
    this.nextId += 1;
    return allocatedId;
  }

  public free(entityId: number): void {
    if (!Number.isInteger(entityId) || entityId <= 0) {
      return;
    }
    // Entity ids are part of the replication identity. Reusing one before every
    // client has observed the despawn lets a new entity inherit stale client
    // presentation state, so ids remain unique for the lifetime of a match.
  }
}
