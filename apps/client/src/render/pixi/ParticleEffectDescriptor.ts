export type ParticleEffectParticleDescriptor = {
  kind: "soft-circle" | "ring";
  x: number;
  y: number;
  durationMs: number;
  baseScale: number;
  velocityX: number;
  velocityY: number;
  tint: number;
  alpha: number;
};

export type ParticleEffectDescriptor = {
  particles: ParticleEffectParticleDescriptor[];
};
