type NumericGuard = (value: number) => boolean;

function parseFiniteNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeFiniteNumber(
  value: unknown,
  fallback: number,
  isValid: NumericGuard = () => true,
): number {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || !isValid(parsed)) {
    return fallback;
  }
  return parsed;
}

export function normalizeFiniteInteger(
  value: unknown,
  fallback: number,
  isValid: NumericGuard = () => true,
): number {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || !Number.isInteger(parsed) || !isValid(parsed)) {
    return fallback;
  }
  return parsed;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
