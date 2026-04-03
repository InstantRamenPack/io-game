import type { ClientEntity } from "@client/net/ClientEntity.ts";

const RESOURCE_TYPE_IDS = [
  "item:wood",
  "item:stone",
  "item:food",
  "item:gun_mag",
  "item:crossbow_mag",
] as const;

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

export function buildResourcePanelContent(options: {
  formatTypeLabel: (typeId: string) => string;
  countInventoryType: (typeId: string) => number;
}): PanelContent {
  const resourceLines = RESOURCE_TYPE_IDS.map((typeId) => {
    return `${options.formatTypeLabel(typeId)}: ${options.countInventoryType(typeId)}`;
  }).join("\n");

  return {
    title: "Resources",
    body: resourceLines || "None",
    minWidth: 200,
    maxWidth: 240,
  };
}

export function buildEffectPanelContent(
  activeEffectLabels: string[],
): PanelContent {
  return {
    title: "Effects",
    body:
      activeEffectLabels.length > 0
        ? activeEffectLabels.join("\n")
        : "No active effects",
    minWidth: 200,
    maxWidth: 240,
  };
}
