import type * as PIXI from "pixi.js";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

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

export type ResourceStackEntry = {
  typeId: ResourceId;
  count: number;
};
