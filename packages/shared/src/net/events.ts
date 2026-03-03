/** Serialized gameplay event emitted alongside snapshots. */
export interface NetEvent {
  type: string;
  tick: number;
  payload: unknown;
}
