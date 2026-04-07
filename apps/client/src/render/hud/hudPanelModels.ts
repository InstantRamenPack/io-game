import type { ClientEntity } from "@client/net/ClientEntity.ts";

export type PanelContent = {
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
  const worldDetail = [
    `Tick ${options.latestTick}`,
    tickRateLabel,
    frameRateLabel,
    `${options.structureCount} structures`,
    `${options.entityCount} entities`,
  ].join(" // ");

  return {
    title: "Sector Feed",
    body: `${worldStat}\n${worldDetail}`,
    minWidth: 360,
    maxWidth: 520,
  };
}
