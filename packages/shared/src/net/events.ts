/**
 * Serialized gameplay event emitted alongside snapshots.
 * Discrete events ride next to snapshot state instead of being modeled as entities.
 */
export interface NetEvent {
  type: string;
  tick: number;
  payload: unknown;
}
