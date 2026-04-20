/**
 * Generates monotonic numeric ids for runtime entities.
 * The server remains the source of truth for all allocated ids.
 */
export class IdGenerator {
  private nextId = 1;
  private readonly freeIds: number[] = [];

  /**
   * Allocates a new runtime entity id.
   * @returns Newly allocated numeric id.
   */
  public alloc(): number {
    const recycled = this.freeIds.pop();
    if (recycled !== undefined) {
      return recycled;
    }
    const allocatedId = this.nextId;
    this.nextId += 1;
    return allocatedId;
  }

  public free(entityId: number): void {
    if (!Number.isInteger(entityId) || entityId <= 0) {
      return;
    }
    this.freeIds.push(entityId);
  }
}
