import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { CRAFTING_STATION_INTERACT_PADDING } from "@shared/gameplay/constants.ts";

type WorldBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function getEntityWorldBounds(entity: ClientEntity): WorldBounds {
  return {
    minX: entity.x + entity.hitboxBounds.minX,
    minY: entity.y + entity.hitboxBounds.minY,
    maxX: entity.x + entity.hitboxBounds.maxX,
    maxY: entity.y + entity.hitboxBounds.maxY,
  };
}

export function isPlayerNearCraftingStation(
  player: ClientEntity | undefined,
  station: ClientEntity,
): boolean {
  if (!player) {
    return false;
  }

  const stationBounds = getEntityWorldBounds(station);
  return (
    player.x >= stationBounds.minX - CRAFTING_STATION_INTERACT_PADDING &&
    player.x <= stationBounds.maxX + CRAFTING_STATION_INTERACT_PADDING &&
    player.y >= stationBounds.minY - CRAFTING_STATION_INTERACT_PADDING &&
    player.y <= stationBounds.maxY + CRAFTING_STATION_INTERACT_PADDING
  );
}

export function hasNearbyCraftingStation(
  player: ClientEntity | undefined,
  stations: ClientEntity[],
): boolean {
  return stations.some((station) =>
    isPlayerNearCraftingStation(player, station),
  );
}

export function findCraftingStationAtWorldPoint(
  stations: ClientEntity[],
  worldX: number,
  worldY: number,
): ClientEntity | undefined {
  return stations.find((station) => {
    const bounds = getEntityWorldBounds(station);
    return (
      worldX >= bounds.minX &&
      worldX <= bounds.maxX &&
      worldY >= bounds.minY &&
      worldY <= bounds.maxY
    );
  });
}
