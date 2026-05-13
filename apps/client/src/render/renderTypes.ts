import type * as PIXI from "pixi.js";

export type WorldSize = {
  w: number;
  h: number;
};

export type ScreenRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Rect = ScreenRect;

export type TextStyleOptions = Partial<PIXI.TextStyleOptions>;

export type VisibilityBlockerRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type VisibilityBlockerShape =
  | {
      kind: "rects";
      sourceEntityId: number;
      rects: VisibilityBlockerRect[];
    }
  | {
      kind: "circle";
      sourceEntityId: number;
      centerX: number;
      centerY: number;
      radius: number;
    };

export type LightsOutVisibilityContext = {
  center: { x: number; y: number };
  radius: number;
  restricted: boolean;
};
