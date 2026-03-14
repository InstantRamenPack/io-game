export type WorldSize = { w: number; h: number };

/*
DISABLED PIXI 


*/
export type PixiApp = {
  screen: { width: number; height: number };
  stage: {
    addChild: (child: unknown) => void;
    removeChild: (child: unknown) => void;
  };
  renderer: { resize: (w: number, h: number) => void; render: (stage: unknown) => void };
  view: HTMLCanvasElement;
};

export type PixiContainer = {
  addChild: (child: unknown) => void;
  removeChild: (child: unknown) => void;
  removeChildren: () => void;
  x: number;
  y: number;
  visible: boolean;
  alpha: number;
  rotation: number;
  position: { x: number; y: number; set: (x: number, y: number) => void };
  pivot: { x: number; y: number; set: (x: number, y: number) => void };
  parent?: PixiContainer;
  destroy: (options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }) => void;
};

export type PixiSprite = {
  texture: unknown;
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  tint: number;
  alpha: number;
  visible: boolean;
  position: { x: number; y: number };
  addChild: (child: unknown) => void;
  removeChild: (child: unknown) => void;
};

export type PixiTexture = {
  width: number;
  height: number;
  baseTexture: unknown;
  update: () => void;
  destroy: () => void;
};

export type PixiGraphics = {
  x: number;
  y: number;
  alpha: number;
  visible: boolean;
  rotation: number;
  scale: { x: number; y: number };
  position: { x: number; y: number };
  pivot: { x: number; y: number; set: (x: number, y: number) => void };
  lineStyle: (width: number, color: number, alpha?: number) => PixiGraphics;
  beginFill: (color: number, alpha?: number) => PixiGraphics;
  endFill: () => PixiGraphics;
  drawCircle: (x: number, y: number, radius: number) => PixiGraphics;
  drawRect: (x: number, y: number, width: number, height: number) => PixiGraphics;
  drawEllipse: (x: number, y: number, width: number, height: number) => PixiGraphics;
  moveTo: (x: number, y: number) => PixiGraphics;
  lineTo: (x: number, y: number) => PixiGraphics;
  clear: () => PixiGraphics;
  addChild: (child: unknown) => void;
  removeChild: (child: unknown) => void;
  destroy: (options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }) => void;
};
