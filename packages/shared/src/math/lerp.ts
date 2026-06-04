export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function lerpColor(start: number, end: number, t: number): number {
  const sr = (start >> 16) & 0xff;
  const sg = (start >> 8) & 0xff;
  const sb = start & 0xff;
  const er = (end >> 16) & 0xff;
  const eg = (end >> 8) & 0xff;
  const eb = end & 0xff;
  const r = Math.round(lerp(sr, er, t));
  const g = Math.round(lerp(sg, eg, t));
  const b = Math.round(lerp(sb, eb, t));
  return (r << 16) | (g << 8) | b;
}
