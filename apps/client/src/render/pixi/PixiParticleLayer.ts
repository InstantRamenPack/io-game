import { Particle, ParticleContainer } from "pixi.js";
import type { Container, Texture } from "pixi.js";
import type {
  ParticleEffectDescriptor,
  ParticleEffectParticleDescriptor,
} from "@client/render/pixi/ParticleEffectDescriptor.ts";
import type { ExplosionStyle } from "@shared/net/events.ts";

type ExplosionParticle = {
  particle: Particle;
  baseScale: number;
  velocityX: number;
  velocityY: number;
  remainingMs: number;
  durationMs: number;
};

export class PixiParticleLayer {
  public readonly container = new ParticleContainer({
    dynamicProperties: {
      position: true,
      scale: true,
      rotation: true,
      color: true,
    },
  });

  private readonly particles: ExplosionParticle[] = [];
  private softCircleTexture: Texture | null = null;
  private ringTexture: Texture | null = null;

  public attach(parent: Container): void {
    if (this.container.parent !== parent) {
      parent.addChild(this.container);
    }
  }

  public setTextures(options: { softCircle: Texture; ring: Texture }): void {
    this.softCircleTexture = options.softCircle;
    this.ringTexture = options.ring;
  }

  public triggerExplosion(
    x: number,
    y: number,
    radius: number,
    style: ExplosionStyle,
  ): void {
    this.triggerEffect(this.buildExplosionEffect(x, y, radius, style));
  }

  public triggerEffect(effect: ParticleEffectDescriptor): void {
    if (!this.softCircleTexture || !this.ringTexture) {
      return;
    }

    for (const particle of effect.particles) {
      const texture =
        particle.kind === "ring" ? this.ringTexture : this.softCircleTexture;
      if (!texture) {
        continue;
      }
      this.spawnParticle({
        texture,
        x: particle.x,
        y: particle.y,
        durationMs: particle.durationMs,
        baseScale: particle.baseScale,
        velocityX: particle.velocityX,
        velocityY: particle.velocityY,
        tint: particle.tint,
        alpha: particle.alpha,
      });
    }
  }

  public update(deltaMs: number): void {
    if (this.particles.length === 0) {
      return;
    }

    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.particles.length; readIndex += 1) {
      const entry = this.particles[readIndex];
      if (!entry) {
        continue;
      }
      entry.remainingMs = Math.max(0, entry.remainingMs - deltaMs);
      if (entry.remainingMs <= 0) {
        this.container.removeParticle(entry.particle);
        continue;
      }

      const progress = 1 - entry.remainingMs / Math.max(1, entry.durationMs);
      entry.particle.x += entry.velocityX * deltaMs;
      entry.particle.y += entry.velocityY * deltaMs;
      entry.particle.scaleX = entry.baseScale * (1 + progress * 2.8);
      entry.particle.scaleY = entry.baseScale * (1 + progress * 2.8);
      entry.particle.alpha = Math.max(0, 1 - progress) * 0.9;
      entry.particle.rotation += deltaMs * 0.002;
      this.particles[writeIndex] = entry;
      writeIndex += 1;
    }

    this.particles.length = writeIndex;
  }

  public destroy(): void {
    this.container.removeParticles();
    this.particles.length = 0;
  }

  private buildExplosionEffect(
    x: number,
    y: number,
    radius: number,
    style: ExplosionStyle,
  ): ParticleEffectDescriptor {
    const durationMs = style === "landmine" ? 320 : 240;
    const primaryColor = style === "landmine" ? 0xff7b21 : 0xffc857;
    const secondaryColor = style === "landmine" ? 0xffd6a0 : 0xfff0bf;
    const particles: ParticleEffectParticleDescriptor[] = [
      {
        kind: "ring",
        x,
        y,
        durationMs,
        baseScale: radius / 64,
        velocityX: 0,
        velocityY: 0,
        tint: primaryColor,
        alpha: 0.9,
      },
      {
        kind: "ring",
        x,
        y,
        durationMs: Math.max(120, durationMs - 40),
        baseScale: (radius * 0.72) / 64,
        velocityX: 0,
        velocityY: 0,
        tint: secondaryColor,
        alpha: 0.7,
      },
    ];

    const sparkCount = 8;
    for (let index = 0; index < sparkCount; index += 1) {
      const angle = (Math.PI * 2 * index) / sparkCount;
      const speed = radius * 0.0016;
      particles.push({
        kind: "soft-circle",
        x,
        y,
        durationMs: 180 + index * 10,
        baseScale: 0.28 + (index % 2) * 0.08,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        tint: index % 2 === 0 ? primaryColor : secondaryColor,
        alpha: 0.65,
      });
    }

    return { particles };
  }

  private spawnParticle(options: {
    texture: Texture;
    x: number;
    y: number;
    durationMs: number;
    baseScale: number;
    velocityX: number;
    velocityY: number;
    tint: number;
    alpha: number;
  }): void {
    const particle = new Particle({
      texture: options.texture,
      x: options.x,
      y: options.y,
      scaleX: options.baseScale,
      scaleY: options.baseScale,
      anchorX: 0.5,
      anchorY: 0.5,
      tint: options.tint,
      alpha: options.alpha,
    });
    this.container.addParticle(particle);
    this.particles.push({
      particle,
      baseScale: options.baseScale,
      velocityX: options.velocityX,
      velocityY: options.velocityY,
      remainingMs: options.durationMs,
      durationMs: options.durationMs,
    });
  }
}
