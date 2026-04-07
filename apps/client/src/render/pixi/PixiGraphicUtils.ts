import {
  type Graphics,
  type ColorSource,
  type FillStyle,
  type StrokeStyle,
} from "pixi.js";

type FillInput = ColorSource | Partial<FillStyle>;
type StrokeInput = Partial<StrokeStyle> | undefined;

function normalizeFill(fill: FillInput): FillInput {
  return typeof fill === "number" || typeof fill === "string"
    ? { color: fill }
    : fill;
}

export function drawRect(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: FillInput,
  stroke?: StrokeInput,
): void {
  graphics.clear();
  graphics.rect(x, y, width, height).fill(normalizeFill(fill));
  if (stroke) {
    graphics.rect(x, y, width, height).stroke(stroke);
  }
}

export function drawRoundedRect(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: FillInput,
  stroke?: StrokeInput,
): void {
  graphics.clear();
  graphics.roundRect(x, y, width, height, radius).fill(normalizeFill(fill));
  if (stroke) {
    graphics.roundRect(x, y, width, height, radius).stroke(stroke);
  }
}

export function drawCircle(
  graphics: Graphics,
  x: number,
  y: number,
  radius: number,
  fill: FillInput,
  stroke?: StrokeInput,
): void {
  graphics.clear();
  graphics.circle(x, y, radius).fill(normalizeFill(fill));
  if (stroke) {
    graphics.circle(x, y, radius).stroke(stroke);
  }
}

export function drawEllipse(
  graphics: Graphics,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  fill: FillInput,
  stroke?: StrokeInput,
): void {
  graphics.clear();
  graphics.ellipse(x, y, radiusX, radiusY).fill(normalizeFill(fill));
  if (stroke) {
    graphics.ellipse(x, y, radiusX, radiusY).stroke(stroke);
  }
}

export function drawLine(
  graphics: Graphics,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  stroke: Partial<StrokeStyle>,
): void {
  graphics.clear();
  graphics.moveTo(startX, startY).lineTo(endX, endY).stroke(stroke);
}
