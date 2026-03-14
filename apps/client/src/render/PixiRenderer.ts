import type { EntitySnapshot } from "@shared/net/snapshots.ts";
import type { PixiApp, PixiContainer, PixiGraphics, PixiSprite, PixiTexture, WorldSize } from "./PixiTypes.ts";

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
  private app: PixiApp | null = null;
  // World container should store everything because transformations applied to it create illusion of following the player
  private world: PixiContainer | null = null;
  private grid: PixiGraphics | null = null;
  private gridCellSize = 100;

  /*
  entity container should store all entities for easy of rendering and stuff
  */

  public playerEntityId?: number;

  public setPlayerEntityId(entityId: number | undefined): void {
    this.playerEntityId = entityId;
  }


  public entityContainer: PixiContainer | null = null;
  private hostElement: HTMLElement | null = null;
  private worldSize: WorldSize = { w: 2000, h: 2000 };
  private readonly handleResize = (): void => {
    if (!this.app) {
      return;
    }
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.renderScene();
    // Manually render after resize to sync with our game loop
    this.app.renderer.render(this.app.stage);
  };

  /**
   * Attaches the Pixi application to the given host element.
   * @param hostElement DOM element that should contain the game canvas.
   * @param worldSize World bounds used to scale entity positions.
   * 
   */


  async init(hostElement: HTMLElement, worldSize: WorldSize): Promise<void> {

    await this.attach(hostElement, worldSize);

    if (!window.PIXI) {
      throw new Error("pixi_unavailable");
    }

    if (!this.app) {
      throw new Error("Pixi App not created");
    }

    window.app = this.app; // Expose Pixi app for debugging

    //load textures here

    await this.loadPixiTextures();

    // create world hierarchy

    
    if (!this.world){
      this.world = new window.PIXI.Container();
    }

    this.ensureGrid();
    this.app.stage.addChild(this.world);

    if (!this.entityContainer){
      this.entityContainer = new window.PIXI.Container();
    }

    this.world.addChild(this.entityContainer);



    // initial render to populate the scene
    this.renderScene();
  }

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
        autoStart: false,  // Disable Pixi's automatic ticker
      });
      window.addEventListener("resize", this.handleResize);
    }

    this.hostElement.innerHTML = "";
    this.hostElement.appendChild(this.app.view as HTMLCanvasElement);
  }

  async loadPixiTextures(): Promise<void> {
    if (!window.PIXI) {
      throw new Error("PIXI is not available on the window object.");
    }
    

    //empty rn
  }

  /**
   * Updates the world size used when projecting world coordinates to screen.
   * @param worldSize Current runtime world size.
   */
  setWorldSize(worldSize: WorldSize): void {
    this.worldSize = { ...worldSize };
    this.drawGrid();
    this.renderScene();
  }


  /**
   * Advances render internals for one frame.
   * @param _deltaMs Frame delta in milliseconds.
   */
  update(_deltaMs: number): void {
    this.renderScene();


  }

  public setCameraToPlayer(x: number, y: number): void {
    if (!this.world) {
      throw new Error("World container not initialized.");
    }
    if (!this.app) {
      throw new Error("Pixi App not initialized.");
    }
    this.world.pivot.set(x, y)
    this.world.position.set(this.app.screen.width/2, this.app.screen.height/2)
  }



  /**
   * Draws the current scene state into the mounted Pixi application.
   */
  private renderScene(): void {
    // actually render the scene (runs every update tick)
    if (!this.app) {
      throw new Error("Pixi App not initialized");
    }
    
    this.app.renderer.render(this.app.stage);

  }

  private ensureGrid(): void {
    if (!window.PIXI) {
      throw new Error("PIXI is not available on the window object.");
    }
    if (!this.app) {
      throw new Error("Pixi App not initialized.");
    }
    if (!this.grid) {
      this.grid = new window.PIXI.Graphics();
    }
    if (this.world && this.grid.parent !== this.world) {
      this.world.addChild(this.grid);
    }
    this.drawGrid();
  }

  private drawGrid(): void {
    if (!this.grid) {
      return;
    }
    const { w, h } = this.worldSize;
    const cell = Math.max(10, Math.floor(this.gridCellSize));

    this.grid.clear();
    this.grid.lineStyle(1, 0x9fd69a, 0.4);

    this.grid.position.set(0, 0);

    for (let x = 0; x <= w; x += cell) {
      this.grid.moveTo(x, 0);
      this.grid.lineTo(x, h);
    }

    for (let y = 0; y <= h; y += cell) {
      this.grid.moveTo(0, y);
      this.grid.lineTo(w, y);
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
    app: PixiApp;
    PIXI?: {
      // Application
      Application: new (options?: {
        resizeTo?: Window;
        backgroundColor?: number;
        antialias?: boolean;
        autoStart?: boolean;
        width?: number;
        height?: number;
        view?: HTMLCanvasElement;
      }) => PixiApp;

      // Display Objects
      Container: new () => PixiContainer;
      Sprite: new (texture?: PixiTexture) => PixiSprite;
      Graphics: new () => PixiGraphics;

      // Assets/Loading
      Assets: {
        load: {
          (url: string): Promise<PixiTexture>;
          (urls: string[]): Promise<PixiTexture[]>;
        };
        get: (url: string) => PixiTexture;
        add: (key: string, url: string) => void;
      };

      // Textures
      Texture: {
        from: (source: string | HTMLImageElement | HTMLCanvasElement) => PixiTexture;
        WHITE: PixiTexture;
        EMPTY: PixiTexture;
      };

      // Math/Utilities
      Point: new (x?: number, y?: number) => { x: number; y: number };
      ObservablePoint: new (cb: Function, scope: any, x?: number, y?: number) => { x: number; y: number };

      // Colors
      Color: {
        shared: {
          setValue: (value: number | string) => void;
        };
      };

      // Render Texture
      RenderTexture: {
        create: (options: { width: number; height: number }) => PixiTexture;
      };

      // Blend Modes
      BLEND_MODES: {
        NORMAL: number;
        ADD: number;
        MULTIPLY: number;
        SCREEN: number;
      };

      // Scale Modes
      SCALE_MODES: {
        LINEAR: number;
        NEAREST: number;
      };
    };
  }
}
