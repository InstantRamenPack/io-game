import { Application } from "pixi.js";

export class PixiAppHost {
  private app: Application | null = null;

  public async attach(
    hostElement: HTMLElement,
    options: {
      backgroundColor: number;
      antialias: boolean;
      autoDensity: boolean;
      autoStart: boolean;
      resolution: number;
    },
  ): Promise<Application> {
    if (!this.app) {
      this.app = new Application();
      await this.app.init({
        preference: "webgpu",
        resizeTo: window,
        background: options.backgroundColor,
        antialias: options.antialias,
        autoDensity: options.autoDensity,
        autoStart: options.autoStart,
        resolution: options.resolution,
      });
    }

    hostElement.replaceChildren(this.app.canvas as HTMLCanvasElement);
    return this.app;
  }

  public getApp(): Application {
    if (!this.app) {
      throw new Error("Pixi application has not been initialized.");
    }
    return this.app;
  }

  public getAppIfReady(): Application | null {
    return this.app;
  }

  public getCanvas(): HTMLCanvasElement | null {
    return this.app ? (this.app.canvas as HTMLCanvasElement) : null;
  }

  public resize(resolution: number): void {
    if (!this.app) {
      return;
    }

    this.app.renderer.resolution = resolution;
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
  }
}
