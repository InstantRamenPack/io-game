import type {
  ChatAutocompleteRule,
  ChatCommandSchemaEntry,
} from "@shared/chat/commandSchema.ts";

export type ParsedChatAutocompleteState = {
  command: string;
  args: string[];
  currentToken: string;
};

export type AutocompleteSuggestion<TValue = string> = {
  value: TValue;
  label: string;
  detail?: string;
};

export function parseChatAutocompleteState(
  value: string,
): ParsedChatAutocompleteState | null {
  if (!value.startsWith("/")) {
    return null;
  }

  const trimmedRight = value.trimEnd();
  const hasTrailingSpace = value.endsWith(" ");
  const raw = trimmedRight.slice(1);
  const parts = raw.length > 0 ? raw.split(/\s+/g) : [];
  if (hasTrailingSpace) {
    parts.push("");
  }

  const command = (parts[0] ?? "").toLowerCase();
  const args = parts.slice(1);
  return {
    command,
    args,
    currentToken: args.length > 0 ? (args[args.length - 1] ?? "") : command,
  };
}

export function matchChatAutocompleteRules(
  command: ChatCommandSchemaEntry,
  args: readonly string[],
): readonly ChatAutocompleteRule[] {
  if (!command.autocomplete) {
    return [];
  }

  const currentArgIndex = Math.max(0, args.length - 1);
  return command.autocomplete.filter((rule) => {
    if (rule.argIndex !== currentArgIndex) {
      return false;
    }
    if (!rule.whenArgEquals) {
      return true;
    }
    const expectedArg = args[rule.whenArgEquals.index] ?? "";
    return expectedArg.toLowerCase() === rule.whenArgEquals.value.toLowerCase();
  });
}

export function normalizeAutocompleteText(value: string): string {
  return value.replace(/[\s_/-]+/g, "").toLowerCase();
}

export function filterAutocompleteSuggestions<TValue>(
  source: readonly AutocompleteSuggestion<TValue>[],
  partial: string,
): AutocompleteSuggestion<TValue>[] {
  const normalizedPartial = normalizeAutocompleteText(partial);
  return source.filter((suggestion) => {
    if (normalizedPartial.length === 0) {
      return true;
    }
    return (
      normalizeAutocompleteText(String(suggestion.value)).includes(
        normalizedPartial,
      ) ||
      normalizeAutocompleteText(suggestion.label).includes(normalizedPartial) ||
      normalizeAutocompleteText(suggestion.detail ?? "").includes(
        normalizedPartial,
      )
    );
  });
}
