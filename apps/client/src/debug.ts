const rawInterpolationMode = import.meta.env.VITE_DEBUG_INTERPOLATION;

export const DEBUG_INTERPOLATION_MODE =
  rawInterpolationMode === "2" ? 2 : rawInterpolationMode === "1" ? 1 : 0;

export const DEBUG_HITBOX = import.meta.env.VITE_DEBUG_HITBOX === "1";
