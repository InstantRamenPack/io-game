const TEXT_ENTRY_INPUT_TYPES = new Set([
  "",
  "date",
  "datetime-local",
  "email",
  "month",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "time",
  "url",
  "week",
]);

export function isKeyboardTextEntryTarget(
  target: EventTarget | Element | null,
): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  if (target instanceof HTMLTextAreaElement) {
    return true;
  }

  if (target instanceof HTMLSelectElement) {
    return true;
  }

  if (!(target instanceof HTMLInputElement)) {
    return false;
  }

  return TEXT_ENTRY_INPUT_TYPES.has(target.type.toLowerCase());
}
