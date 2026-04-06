import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type {
  AttackStyle,
  EquippedRender,
  WeaponContent,
} from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type * as PIXI from "pixi.js";

export type EquippedRenderContext = {
  entity: ClientEntity;
  weaponContent: WeaponContent;
  renderManifest: EquippedRender;
  typeId: ResourceId;
  attackStyle: AttackStyle;
  facingLeft: boolean;
  mirrorSign: 1 | -1;
  progress: number;
  attackAnimationDurationMs: number;
};

export type EquippedStaticSyncInput = EquippedRenderContext & {
  container: PIXI.Container;
  sprite: PIXI.Sprite;
  texture: PIXI.Texture;
};

export type EquippedAnimatedSyncInput = EquippedRenderContext & {
  container: PIXI.Container;
  sprite: PIXI.Sprite;
};

export interface EquippedItemRenderer {
  syncStatic(input: EquippedStaticSyncInput): void;
  syncAnimated(input: EquippedAnimatedSyncInput): void;
  onAttackStart?(context: EquippedRenderContext): void;
}
