import type { EntitySnapshot } from "@shared/net/snapshots.ts";

type WorldSize = { w: number; h: number };

type PixiGraphics = {
  clear: () => void;
  beginFill: (color: number, alpha?: number) => void;
  lineStyle: (width: number, color?: number, alpha?: number) => void;
  drawCircle: (x: number, y: number, radius: number) => void;
  endFill: () => void;
  x: number;
  y: number;
};

type PixiApp = {
  screen: { width: number; height: number };
  stage: {
    addChild: (child: unknown) => void;
    removeChild: (child: unknown) => void;
  };
  renderer: { resize: (w: number, h: number) => void };
  view: HTMLCanvasElement;
};

let pixiScriptPromise: Promise<void> | null = null;

/**
 * Loads the Pixi browser bundle on demand through the existing CDN path.
 * @returns Promise that resolves once the global PIXI namespace is ready.
 */
async function loadPixiScript(): Promise<void> {
  if (window.PIXI) {
    return;
  }
  if (pixiScriptPromise) {
    await pixiScriptPromise;
    return;
  }

  pixiScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://cdn.jsdelivr.net/npm/pixi.js@7.4.3/dist/pixi.min.js"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("pixi_load_failed")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/pixi.js@7.4.3/dist/pixi.min.js";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("pixi_load_failed")),
      { once: true },
    );
    document.head.appendChild(script);
  });

  await pixiScriptPromise;
}

/**
 * Rendering adapter for visible entity state.
 * Owns the Pixi scene lifecycle and keeps authoritative entity state in sync.
 */
export class PixiRenderer {
  private entities = new Map<number, EntitySnapshot>();
  private circlesByEntityId = new Map<number, PixiGraphics>();
  private app: PixiApp | null = null;
  private hostElement: HTMLElement | null = null;
  private worldSize: WorldSize = { w: 2000, h: 2000 };
  private readonly handleResize = (): void => {
    if (!this.app) {
      return;
    }
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.renderScene();
  };

  /**
   * Attaches the Pixi application to the given host element.
   * @param hostElement DOM element that should contain the game canvas.
   * @param worldSize World bounds used to scale entity positions.
   */
  async attach(hostElement: HTMLElement, worldSize: WorldSize): Promise<void> {
    this.hostElement = hostElement;
    this.worldSize = { ...worldSize };

    await loadPixiScript();
    if (!window.PIXI) {
      throw new Error("pixi_unavailable");
    }

    if (!this.app) {
      this.app = new window.PIXI.Application({
        resizeTo: window,
        backgroundColor: 0xd7f3d2,
        antialias: true,
      });
      window.addEventListener("resize", this.handleResize);
    }

    this.hostElement.innerHTML = "";
    this.hostElement.appendChild(this.app.view as HTMLCanvasElement);
    this.renderScene();
  }

  /**
   * Updates the world size used when projecting world coordinates to screen.
   * @param worldSize Current runtime world size.
   */
  setWorldSize(worldSize: WorldSize): void {
    this.worldSize = { ...worldSize };
    this.renderScene();
  }

  /**
   * Replaces the current visible entity set.
   * @param entities Extrapolated entities keyed by id.
   */
  sync(entities: Map<number, EntitySnapshot>): void {
    this.entities = new Map(entities);
  }

  /**
   * Advances render internals for one frame.
   * @param _deltaMs Frame delta in milliseconds.
   */
  update(_deltaMs: number): void {
    this.renderScene();
  }

  /**
   * Placeholder spawn hook for future renderer-specific setup.
   * @param _id Entity id being created.
   * @param _kind Entity kind being created.
   */
  spawn(_id: number, _kind: string): void {
    // Renderer-specific creation is handled lazily in renderScene.
  }

  /**
   * Removes an entity from the renderer cache.
   * @param id Entity id to remove.
   */
  despawn(id: number): void {
    this.entities.delete(id);
    const circle = this.circlesByEntityId.get(id);
    if (circle && this.app) {
      this.app.stage.removeChild(circle);
    }
    this.circlesByEntityId.delete(id);
  }

  /**
   * Clears visible scene state without tearing down the mounted Pixi app.
   */
  clear(): void {
    for (const entityId of Array.from(this.circlesByEntityId.keys())) {
      this.despawn(entityId);
    }
    this.entities.clear();
  }

  /**
   * Draws the current scene state into the mounted Pixi application.
   */
  private renderScene(): void {
    const pixi = window.PIXI;
    if (!this.app || !pixi) {
      return;
    }

    const currentIds = new Set(this.entities.keys());
    for (const [entityId, circle] of this.circlesByEntityId) {
      if (!currentIds.has(entityId)) {
        this.app.stage.removeChild(circle);
        this.circlesByEntityId.delete(entityId);
      }
    }

    const worldWidth = Math.max(1, this.worldSize.w);
    const worldHeight = Math.max(1, this.worldSize.h);
    const scale = Math.min(
      this.app.screen.width / worldWidth,
      this.app.screen.height / worldHeight,
    );

    for (const entity of this.entities.values()) {
      let circle = this.circlesByEntityId.get(entity.id);
      if (!circle) {
        circle = new pixi.Graphics();
        this.app.stage.addChild(circle);
        this.circlesByEntityId.set(entity.id, circle);
      }

      circle.clear();
      circle.beginFill(this.colorForKind(entity.kind), 1);
      circle.lineStyle(2, 0x0f210f, 0.8);
      circle.drawCircle(0, 0, Math.max(4, entity.radius * scale));
      circle.endFill();
      circle.x = entity.x * scale;
      circle.y = entity.y * scale;
    }
  }

  /**
   * Picks a debug-friendly fill color for the current entity type.
   * @param kind Entity kind label.
   * @returns Pixi color value.
   */
  private colorForKind(kind: string): number {
    if (kind === "player") {
      return 0x67d944;
    }
    if (kind === "enemy") {
      return 0xff5f5f;
    }
    return 0xd6e5d2;
  }
}

declare global {
  interface Window {
    PIXI?: {
      Application: new (options: {
        resizeTo?: Window;
        backgroundColor?: number;
        antialias?: boolean;
      }) => PixiApp;
      Graphics: new () => PixiGraphics;
    };
  }
}
