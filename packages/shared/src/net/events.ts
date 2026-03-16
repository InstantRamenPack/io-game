export type DamageEventPayload = {
  sourceId: number;
  targetId: number;
  amount: number;
  remainingHp: number;
  maxHp: number;
  x: number;
  y: number;
  isFatal: boolean;
};

/**
 * Serialized gameplay event emitted alongside snapshots.
 * Discrete events ride next to snapshot state instead of being modeled as entities.
 */
export type NetEvent = {
  type: "damage";
  tick: number;
  payload: DamageEventPayload;
};
