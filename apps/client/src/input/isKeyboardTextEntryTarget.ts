export function isKeyboardTextEntryTarget(
  target: EventTarget | null | undefined,
): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}
