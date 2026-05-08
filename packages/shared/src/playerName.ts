export const MAX_PLAYER_NAME_LENGTH = 20;

export function normalizePlayerName(
  requestedPlayerName: string | undefined,
  fallbackPlayerName: string,
): string {
  const sanitizedPlayerName = (requestedPlayerName ?? "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, MAX_PLAYER_NAME_LENGTH);
  return sanitizedPlayerName || fallbackPlayerName;
}
