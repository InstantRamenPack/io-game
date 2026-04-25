import { DroneShooterEquippedRenderer } from "@client/render/entity/equipped/DroneShooterEquippedRenderer.ts";
import type { EquippedItemRenderer } from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { FistsEquippedRenderer } from "@client/render/entity/equipped/FistsEquippedRenderer.ts";
import { KatanaEquippedRenderer } from "@client/render/entity/equipped/KatanaEquippedRenderer.ts";
import { RangedEquippedRenderer } from "@client/render/entity/equipped/RangedEquippedRenderer.ts";
import { StabMeleeEquippedRenderer } from "@client/render/entity/equipped/StabMeleeEquippedRenderer.ts";
import { SweepMeleeEquippedRenderer } from "@client/render/entity/equipped/SweepMeleeEquippedRenderer.ts";
import type { AttackStyle } from "@shared/content/schema.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

const rangedEquippedRenderer = new RangedEquippedRenderer();
const stabMeleeEquippedRenderer = new StabMeleeEquippedRenderer();
const sweepMeleeEquippedRenderer = new SweepMeleeEquippedRenderer();
const droneShooterEquippedRenderer = new DroneShooterEquippedRenderer();
const fistsEquippedRenderer = new FistsEquippedRenderer();
const katanaEquippedRenderer = new KatanaEquippedRenderer();

const rendererByAttackStyle: Record<AttackStyle, EquippedItemRenderer> = {
  shoot: rangedEquippedRenderer,
  jab: stabMeleeEquippedRenderer,
  swing: sweepMeleeEquippedRenderer,
};

const rendererByTypeId = new Map<ResourceId, EquippedItemRenderer>([
  [makeResourceId("item", "drone_shooter"), droneShooterEquippedRenderer],
  [makeResourceId("item", "fists"), fistsEquippedRenderer],
  [makeResourceId("item", "katana"), katanaEquippedRenderer],
]);

export function resolveEquippedItemRenderer(options: {
  typeId: ResourceId;
  attackStyle: AttackStyle;
}): EquippedItemRenderer {
  const typeRenderer = rendererByTypeId.get(options.typeId);
  if (typeRenderer) {
    return typeRenderer;
  }
  return rendererByAttackStyle[options.attackStyle];
}
