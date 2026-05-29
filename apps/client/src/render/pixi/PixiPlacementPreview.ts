import { Container, Graphics } from "pixi.js";
import type { HitboxRect } from "@shared/geometry/hitbox.ts";

export type PlacementPreviewState = {
  visible: boolean;
  worldX: number;
  worldY: number;
  valid: boolean;
  typeId: string;
  hitboxProfiles: Record<string, readonly HitboxRect[]>;
  activeHitboxProfile?: string;
};

type PreviewShape = "rect" | "rounded" | "circle";
type PreviewStyle = {
  color: number;
  shape: PreviewShape;
  radius?: number;
};

const PREVIEW_BASE_ALPHA = 0.45;
const PREVIEW_INVALID_ALPHA = 0.35;
const PREVIEW_STROKE = { width: 2, color: 0x0f1a14, alpha: 0.22 };
const INVALID_OVERLAY_COLOR = 0xd14c4c;

const PREVIEW_STYLE_BY_TYPE: Record<string, PreviewStyle> = {
  "building:wall": { color: 0x8b6f57, shape: "rounded", radius: 4 },
  "building:cannon": { color: 0xc78d2d, shape: "rect" },
  "tower:hub": { color: 0x6b4a2f, shape: "rounded", radius: 4 },
  "building:landmine": { color: 0x454545, shape: "circle" },
};

const DEFAULT_STYLE: PreviewStyle = {
  color: 0x93a89b,
  shape: "rounded",
  radius: 4,
};

export class PixiPlacementPreview {
  public readonly container = new Container({ label: "placementPreview" });

  private readonly baseGraphic = new Graphics();
  private readonly invalidGraphic = new Graphics();
  private lastSignature = "";

  constructor() {
    this.container.addChild(this.baseGraphic, this.invalidGraphic);
    this.container.visible = false;
  }

  public attach(parent: Container): void {
    if (this.container.parent !== parent) {
      parent.addChild(this.container);
    }
  }

  public sync(state: PlacementPreviewState | null): void {
    if (!state || !state.visible) {
      this.container.visible = false;
      return;
    }

    this.container.visible = true;
    this.container.position.set(state.worldX, state.worldY);

    const rects = resolveHitboxProfile(
      state.hitboxProfiles,
      state.activeHitboxProfile,
    );
    if (!rects || rects.length === 0) {
      this.container.visible = false;
      return;
    }

    const style = PREVIEW_STYLE_BY_TYPE[state.typeId] ?? DEFAULT_STYLE;
    const signature = buildSignature(state.typeId, style, rects);
    if (signature !== this.lastSignature) {
      this.redraw(rects, style);
      this.lastSignature = signature;
    }

    this.invalidGraphic.visible = !state.valid;
  }

  private redraw(rects: readonly HitboxRect[], style: PreviewStyle): void {
    this.baseGraphic.clear();
    this.invalidGraphic.clear();

    drawPreviewRects(
      this.baseGraphic,
      rects,
      style,
      style.color,
      PREVIEW_BASE_ALPHA,
      PREVIEW_STROKE,
    );
    drawPreviewRects(
      this.invalidGraphic,
      rects,
      style,
      INVALID_OVERLAY_COLOR,
      PREVIEW_INVALID_ALPHA,
    );
  }
}

function resolveHitboxProfile(
  profiles: Record<string, readonly HitboxRect[]>,
  activeProfile?: string,
): readonly HitboxRect[] | undefined {
  if (activeProfile && profiles[activeProfile]) {
    return profiles[activeProfile];
  }
  const [firstProfile] = Object.values(profiles);
  return firstProfile;
}

function buildSignature(
  typeId: string,
  style: PreviewStyle,
  rects: readonly HitboxRect[],
): string {
  const rectSignature = rects
    .map(
      (rect) => `${rect.width},${rect.height},${rect.offsetX},${rect.offsetY}`,
    )
    .join("|");
  return `${typeId}:${style.shape}:${style.radius ?? 0}:${rectSignature}`;
}

function drawPreviewRects(
  graphics: Graphics,
  rects: readonly HitboxRect[],
  style: PreviewStyle,
  color: number,
  alpha: number,
  stroke?: { width: number; color: number; alpha: number },
): void {
  for (const rect of rects) {
    const x = rect.offsetX - rect.width / 2;
    const y = rect.offsetY - rect.height / 2;

    switch (style.shape) {
      case "circle": {
        const radius = Math.max(rect.width, rect.height) / 2;
        graphics.circle(rect.offsetX, rect.offsetY, radius).fill({
          color,
          alpha,
        });
        if (stroke) {
          graphics.circle(rect.offsetX, rect.offsetY, radius).stroke(stroke);
        }
        break;
      }
      case "rounded": {
        const radius = style.radius ?? 4;
        graphics.roundRect(x, y, rect.width, rect.height, radius).fill({
          color,
          alpha,
        });
        if (stroke) {
          graphics
            .roundRect(x, y, rect.width, rect.height, radius)
            .stroke(stroke);
        }
        break;
      }
      default: {
        graphics.rect(x, y, rect.width, rect.height).fill({ color, alpha });
        if (stroke) {
          graphics.rect(x, y, rect.width, rect.height).stroke(stroke);
        }
        break;
      }
    }
  }
}
