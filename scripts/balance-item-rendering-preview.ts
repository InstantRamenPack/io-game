import type { ClientEntity } from "@client/net/ClientEntity.ts";
import {
  buildEquippedRenderContext,
  resolveAttackAnimationDurationMs,
  syncEquippedItemVisual,
} from "@client/render/entity/equipped/equippedItemVisualSync.ts";
import { resolveEquippedItemRenderer } from "@client/render/entity/equipped/EquippedItemRendererRegistry.ts";
import { syncItemIconSprite } from "@client/render/hud/itemIconRendering.ts";
import type {
  AttackStyle,
  ItemIconRendering,
  ItemRendering,
  ItemSpriteRendering,
  WeaponContent,
} from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Texture,
} from "pixi.js";

const PREVIEW_WIDTH = 820;
const PREVIEW_HEIGHT = 520;
const ORIGIN_X = 230;
const ORIGIN_Y = 230;
const ICON_SLOT_SIZE = 96;
const ICON_SLOT_X = 610;
const ICON_SLOT_Y = 190;
const PREVIEW_AIM_ROTATION = 0;
const GAME_TICK_RATE = 20;
const PREVIEW_ENTITY = { id: 1, alive: true } as ClientEntity;

export type BalanceRenderingField = {
  key: string;
  value: string | number | null;
};

export type BalanceRenderingPreviewRow = {
  itemTypeId: string;
  attackStyle: string | null;
  fields: BalanceRenderingField[];
};

export type BalanceRenderingPreviewState = {
  itemTypeId: ResourceId;
  attackStyle: AttackStyle | null;
  rendering: ItemRendering;
  weaponContent: WeaponContent | null;
  attackOverlay: {
    range: number;
    jabWidth: number;
    sweepArcDeg: number;
    spreadDeg: number;
    projectileRange: number;
    hitboxWidth: number;
  };
};

export function fieldNumber(
  row: BalanceRenderingPreviewRow,
  key: string,
  fallback: number,
): number {
  const value = row.fields.find((field) => field.key === key)?.value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export function fieldString(
  row: BalanceRenderingPreviewRow,
  key: string,
  fallback: string,
): string {
  const value = row.fields.find((field) => field.key === key)?.value;
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function parseAttackStyle(attackStyle: string | null): AttackStyle | null {
  if (
    attackStyle === "shoot" ||
    attackStyle === "jab" ||
    attackStyle === "swing"
  ) {
    return attackStyle;
  }
  return null;
}

function buildWeaponContentFromRow(
  row: BalanceRenderingPreviewRow,
  attackStyle: AttackStyle,
): WeaponContent {
  return {
    attackStyle,
    cooldownTicks: fieldNumber(row, "itemLike.cooldownTicks", 10),
  } as WeaponContent;
}

export function buildPreviewStateFromBalanceRow(
  row: BalanceRenderingPreviewRow,
): BalanceRenderingPreviewState {
  const attackStyle = parseAttackStyle(row.attackStyle);
  const comboStabJabDistance = fieldNumber(
    row,
    "itemLike.comboStabJabDistance",
    Number.NaN,
  );
  const sprite: ItemSpriteRendering = {
    x: fieldNumber(row, "itemLike.spriteX", 0),
    y: fieldNumber(row, "itemLike.spriteY", 0),
    rotationDeg: fieldNumber(row, "itemLike.spriteRotationDeg", 0),
    scale: fieldNumber(row, "itemLike.spriteScale", 1),
    recoilDistance: fieldNumber(row, "itemLike.spriteRecoilDistance", 0),
    swingAngleDeg: fieldNumber(row, "itemLike.spriteSwingAngleDeg", 0),
    jabDistance: fieldNumber(row, "itemLike.spriteJabDistance", 0),
  };
  const icon: ItemIconRendering = {
    x: fieldNumber(row, "itemLike.iconX", 0),
    y: fieldNumber(row, "itemLike.iconY", 0),
    rotationDeg: fieldNumber(row, "itemLike.iconRotationDeg", 0),
    scale: fieldNumber(row, "itemLike.iconScale", 1),
  };

  return {
    itemTypeId: row.itemTypeId as ResourceId,
    attackStyle,
    rendering: {
      assetPath: fieldString(row, "itemLike.assetPath", "/placeholder.png"),
      sprite,
      icon,
      ...(Number.isFinite(comboStabJabDistance)
        ? { comboStab: { jabDistance: comboStabJabDistance } }
        : {}),
    },
    weaponContent: attackStyle
      ? buildWeaponContentFromRow(row, attackStyle)
      : null,
    attackOverlay: {
      range: fieldNumber(row, "itemLike.range", 0),
      jabWidth: fieldNumber(row, "itemLike.jabWidth", 16),
      sweepArcDeg: fieldNumber(row, "itemLike.sweepArcDeg", 60),
      spreadDeg: fieldNumber(row, "itemLike.spreadDeg", 0),
      projectileRange: fieldNumber(row, "projectile.range", 180),
      hitboxWidth: fieldNumber(row, "projectile.hitboxWidth", 6),
    },
  };
}

function rendererResolution(): number {
  return Math.max(1, window.devicePixelRatio || 1);
}

function applyTextureSampling(texture: Texture): void {
  texture.source.scaleMode = "linear";
}

async function loadPreviewTexture(assetPath: string): Promise<Texture> {
  await Assets.load(assetPath);
  const texture = Texture.from(assetPath);
  applyTextureSampling(texture);
  return texture;
}

function syncEquippedPreviewPose(options: {
  state: BalanceRenderingPreviewState;
  container: Container;
  sprite: Sprite;
  texture: Texture;
  attackAnimationRemainingMs: number;
  attackAnimationDurationMs: number;
}): void {
  const attackStyle = options.state.attackStyle;
  if (!attackStyle || !options.state.weaponContent) {
    options.sprite.visible = false;
    return;
  }

  const renderer = resolveEquippedItemRenderer({
    typeId: options.state.itemTypeId,
    attackStyle,
  });
  const context = buildEquippedRenderContext({
    entity: PREVIEW_ENTITY,
    rotation: PREVIEW_AIM_ROTATION,
    typeId: options.state.itemTypeId,
    weaponContent: options.state.weaponContent,
    renderManifest: options.state.rendering.sprite,
    attackAnimationRemainingMs: options.attackAnimationRemainingMs,
    attackAnimationDurationMs: options.attackAnimationDurationMs,
  });
  syncEquippedItemVisual({
    renderer,
    context,
    container: options.container,
    sprite: options.sprite,
    texture: options.texture,
  });
  options.sprite.visible = true;
}

function apexAnimationTiming(state: BalanceRenderingPreviewState): {
  attackAnimationRemainingMs: number;
  attackAnimationDurationMs: number;
} {
  if (!state.weaponContent) {
    return { attackAnimationRemainingMs: 0, attackAnimationDurationMs: 0 };
  }
  const attackAnimationDurationMs = resolveAttackAnimationDurationMs(
    state.weaponContent,
    GAME_TICK_RATE,
  );
  return {
    attackAnimationDurationMs,
    attackAnimationRemainingMs: attackAnimationDurationMs / 2,
  };
}

function drawAttackShape(
  graphics: Graphics,
  state: BalanceRenderingPreviewState,
  originX: number,
  originY: number,
): void {
  const style = state.attackStyle;
  const overlay = state.attackOverlay;
  graphics.clear();
  graphics.fill({ color: 0xffcc66, alpha: 0.18 });
  graphics.stroke({ width: 2, color: 0xffcc66, alpha: 0.8 });

  if (style === "jab") {
    graphics.rect(
      originX,
      originY - overlay.jabWidth / 2,
      overlay.range + 18,
      overlay.jabWidth,
    );
  } else if (style === "swing") {
    const start = (-overlay.sweepArcDeg * Math.PI) / 360;
    const end = (overlay.sweepArcDeg * Math.PI) / 360;
    graphics.moveTo(originX, originY);
    graphics.arc(originX, originY, overlay.range + 18, start, end);
    graphics.lineTo(originX, originY);
  } else if (style === "shoot") {
    const halfSpread = (overlay.spreadDeg * Math.PI) / 360;
    const endTop = [
      originX + Math.cos(-halfSpread) * overlay.projectileRange,
      originY + Math.sin(-halfSpread) * overlay.projectileRange,
    ];
    const endBottom = [
      originX + Math.cos(halfSpread) * overlay.projectileRange,
      originY + Math.sin(halfSpread) * overlay.projectileRange,
    ];
    graphics.moveTo(originX, originY - overlay.hitboxWidth / 2);
    graphics.lineTo(endTop[0]!, endTop[1]!);
    graphics.lineTo(endBottom[0]!, endBottom[1]!);
    graphics.lineTo(originX, originY + overlay.hitboxWidth / 2);
    graphics.lineTo(originX, originY - overlay.hitboxWidth / 2);
  }

  graphics.fill();
  graphics.stroke();
}

export type BalanceRenderingPreview = {
  update: (row: BalanceRenderingPreviewRow) => Promise<void>;
  destroy: () => void;
};

export async function createBalanceRenderingPreview(
  hostElement: HTMLElement,
): Promise<BalanceRenderingPreview> {
  const app = new Application();
  await app.init({
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    background: "#101820",
    antialias: true,
    autoDensity: true,
    resolution: rendererResolution(),
  });
  hostElement.replaceChildren(app.canvas as HTMLCanvasElement);

  const attackGraphic = new Graphics();
  const playerGraphic = new Graphics()
    .circle(0, 0, 18)
    .fill({ color: 0x67d944, alpha: 1 })
    .stroke({ width: 2, color: 0x0b1a0d, alpha: 1 });
  playerGraphic.position.set(ORIGIN_X, ORIGIN_Y);

  const staticEquippedContainer = new Container();
  const staticEquippedSprite = new Sprite();
  staticEquippedContainer.position.set(ORIGIN_X, ORIGIN_Y);
  staticEquippedContainer.addChild(staticEquippedSprite);

  const apexEquippedContainer = new Container();
  const apexEquippedSprite = new Sprite();
  apexEquippedContainer.position.set(ORIGIN_X, ORIGIN_Y);
  apexEquippedContainer.addChild(apexEquippedSprite);
  apexEquippedContainer.alpha = 0.42;

  const iconSlot = new Graphics()
    .roundRect(0, 0, ICON_SLOT_SIZE, ICON_SLOT_SIZE, 6)
    .fill({ color: 0x262626, alpha: 0.95 })
    .stroke({ width: 2, color: 0xf0f0f0, alpha: 0.9 });
  iconSlot.position.set(ICON_SLOT_X, ICON_SLOT_Y);
  const iconSprite = new Sprite();

  app.stage.addChild(
    attackGraphic,
    playerGraphic,
    apexEquippedContainer,
    staticEquippedContainer,
    iconSlot,
    iconSprite,
  );

  let textureCacheKey = "";
  let texture: Texture | null = null;
  let drawGeneration = 0;

  const update = async (row: BalanceRenderingPreviewRow): Promise<void> => {
    const generation = ++drawGeneration;
    const state = buildPreviewStateFromBalanceRow(row);
    const nextTextureKey = state.rendering.assetPath;
    if (!texture || textureCacheKey !== nextTextureKey) {
      texture = await loadPreviewTexture(nextTextureKey);
      textureCacheKey = nextTextureKey;
    }
    if (generation !== drawGeneration) {
      return;
    }

    drawAttackShape(attackGraphic, state, ORIGIN_X, ORIGIN_Y);

    staticEquippedContainer.visible = state.attackStyle !== null;
    apexEquippedContainer.visible = state.attackStyle !== null;
    if (state.attackStyle) {
      syncEquippedPreviewPose({
        state,
        container: staticEquippedContainer,
        sprite: staticEquippedSprite,
        texture,
        attackAnimationRemainingMs: 0,
        attackAnimationDurationMs: 0,
      });
      const apexTiming = apexAnimationTiming(state);
      syncEquippedPreviewPose({
        state,
        container: apexEquippedContainer,
        sprite: apexEquippedSprite,
        texture,
        ...apexTiming,
      });
    }

    syncItemIconSprite({
      sprite: iconSprite,
      typeId: state.itemTypeId,
      texture,
      boxSize: ICON_SLOT_SIZE,
      centerX: ICON_SLOT_X + ICON_SLOT_SIZE / 2,
      centerY: ICON_SLOT_Y + ICON_SLOT_SIZE / 2,
      padding: 7,
      icon: state.rendering.icon,
    });
  };

  const handleResize = (): void => {
    app.renderer.resolution = rendererResolution();
    app.renderer.resize(PREVIEW_WIDTH, PREVIEW_HEIGHT);
  };
  window.addEventListener("resize", handleResize);

  return {
    update,
    destroy: () => {
      drawGeneration += 1;
      window.removeEventListener("resize", handleResize);
      app.destroy(true, { children: true });
    },
  };
}
