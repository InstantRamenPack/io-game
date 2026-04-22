import type { NetEvent } from "@shared/net/events.ts";

const EMPTY_EVENTS: NetEvent[] = [];
const EVENT_RELEVANCE_PADDING = 180;

/**
 * Filters tick events per player interest radius.
 */
export class EventRelevanceFilter {
  private preparedEvents: readonly NetEvent[] = [];
  private readonly eventBuffer: NetEvent[] = [];

  public prepare(events: readonly NetEvent[]): void {
    this.preparedEvents = events;
  }

  public getRelevantEventsForPlayer(
    playerX: number,
    playerY: number,
    playerId: number,
    interestRadius: number,
  ): NetEvent[] {
    if (this.preparedEvents.length === 0) {
      return EMPTY_EVENTS;
    }

    const eventRadius = interestRadius + EVENT_RELEVANCE_PADDING;
    const eventRadiusSquared = eventRadius * eventRadius;
    this.eventBuffer.length = 0;

    for (const event of this.preparedEvents) {
      if (
        isEventRelevantForPlayer(
          event,
          playerX,
          playerY,
          playerId,
          eventRadiusSquared,
        )
      ) {
        this.eventBuffer.push(event);
      }
    }

    if (this.eventBuffer.length === this.preparedEvents.length) {
      return this.preparedEvents as NetEvent[];
    }

    return [...this.eventBuffer];
  }
}

function isEventRelevantForPlayer(
  event: NetEvent,
  playerX: number,
  playerY: number,
  playerId: number,
  eventRadiusSquared: number,
): boolean {
  if (event.type === "damage") {
    if (
      event.payload.targetId === playerId ||
      event.payload.sourceId === playerId
    ) {
      return true;
    }

    const deltaX = event.payload.x - playerX;
    const deltaY = event.payload.y - playerY;
    return deltaX * deltaX + deltaY * deltaY <= eventRadiusSquared;
  }

  if (event.payload.sourceId === playerId) {
    return true;
  }
  const deltaX = event.payload.x - playerX;
  const deltaY = event.payload.y - playerY;
  return deltaX * deltaX + deltaY * deltaY <= eventRadiusSquared;
}
