import { describe, expect, test } from "bun:test";
import { compositeImageFitWithTransform } from "scripts/generate-content-manifest.ts";

type RgbaPng = {
  width: number;
  height: number;
  pixels: Buffer;
};

function createImage(width: number, height: number): RgbaPng {
  return {
    width,
    height,
    pixels: Buffer.alloc(width * height * 4, 0),
  };
}

function setPixel(
  image: RgbaPng,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): void {
  const index = (y * image.width + x) * 4;
  image.pixels[index] = rgba[0];
  image.pixels[index + 1] = rgba[1];
  image.pixels[index + 2] = rgba[2];
  image.pixels[index + 3] = rgba[3];
}

function getPixel(
  image: RgbaPng,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const index = (y * image.width + x) * 4;
  return [
    image.pixels[index] ?? 0,
    image.pixels[index + 1] ?? 0,
    image.pixels[index + 2] ?? 0,
    image.pixels[index + 3] ?? 0,
  ];
}

describe("blueprint generation", () => {
  test("applies the source item transform before compositing the preview", () => {
    const target = createImage(4, 4);
    const source = createImage(2, 2);
    setPixel(source, 1, 0, [255, 0, 0, 255]);

    compositeImageFitWithTransform(target, source, {
      centerX: 2,
      centerY: 2,
      maxWidth: 2,
      maxHeight: 2,
      transform: {
        x: 0,
        y: 0,
        rotationDeg: 90,
        scale: 1,
      },
    });

    expect(getPixel(target, 3, 2)).toEqual([255, 0, 0, 255]);
    expect(getPixel(target, 2, 1)[3]).toBe(0);
  });
});
