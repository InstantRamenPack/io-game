import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { InfrastructureSnapshot } from "@shared/net/snapshots.ts";

type PanelContent = {
  title: string;
  body: string;
  minWidth?: number;
  maxWidth?: number;
};

export function buildStatusPanelContent(options: {
  playerEntity: ClientEntity | undefined;
  latestTick: number;
  structureCount: number;
  entityCount: number;
  infrastructure: InfrastructureSnapshot | undefined;
  tickRate: number | null;
  frameRate: number | null;
}): PanelContent {
  const tickRateLabel =
    options.tickRate === null ? "TPS --" : `TPS ${options.tickRate.toFixed(1)}`;
  const frameRateLabel =
    options.frameRate === null
      ? "FPS --"
      : `FPS ${options.frameRate.toFixed(1)}`;

  const worldStat = options.playerEntity
    ? `${options.playerEntity.name ?? "Survivor"}  HP ${options.playerEntity.hp ?? 0}/${options.playerEntity.maxHp ?? 0}`
    : "Awaiting welcome packet...";
  const infrastructure = options.infrastructure;
  const infrastructureDetail = infrastructure
    ? `Energy ${infrastructure.energyActive ? "online" : "offline"} // Comms ${
        infrastructure.commsActive ? "online" : "offline"
      }`
    : "Infrastructure syncing...";
  const worldDetail = [
    `Tick ${options.latestTick}`,
    tickRateLabel,
    frameRateLabel,
    `${options.structureCount} structures`,
    `${options.entityCount} entities`,
  ].join(" // ");

  return {
    title: "Sector Feed",
    body: `${worldStat}\n${infrastructureDetail}\n${worldDetail}`,
    minWidth: 360,
    maxWidth: 520,
  };
}
