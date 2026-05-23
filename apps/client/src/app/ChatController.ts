import type { AppElements } from "@client/app/AppElements.ts";
import type { HudController } from "@client/app/HudController.ts";
import type { SessionUiController } from "@client/app/session/SessionUiController.ts";
import { isPlayingSession } from "@client/app/session/sessionUiSelectors.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import {
  CHAT_COMMAND_SCHEMAS,
  getChatCommandSchemaById,
  resolveChatCommandAlias,
  type ChatAutocompleteSource,
} from "@shared/chat/commandSchema.ts";
import {
  filterAutocompleteSuggestions,
  matchChatAutocompleteRules,
  parseChatAutocompleteState,
} from "@shared/chat/commandAutocomplete.ts";
import {
  getAllEffectContentEntries,
  getAllEntityContentEntries,
  getAllItemContentEntries,
} from "@shared/content/catalog.ts";
import { getResourcePath } from "@shared/ids/ResourceId.ts";
import type { ChatMessage } from "@shared/net/protocol.ts";

export type ChatController = {
  setVisible: (visible: boolean) => void;
  open: (seedText?: string) => void;
  close: () => void;
  isOpen: () => boolean;
};

type ChatControllerOptions = {
  elements: AppElements;
  gameClient: GameClient;
  hudController: HudController;
  sessionUiController: SessionUiController;
};

type ChatLine = {
  element: HTMLDivElement;
  createdAt: number;
  fadeTimeout?: number;
  removeTimeout?: number;
};

type ChatSuggestion = {
  value: string;
  label: string;
  detail?: string;
};

type ParsedCommandState = {
  command: string;
  args: string[];
  currentToken: string;
};

const MAX_LINES = 8;
const FADE_AFTER_MS = 8000;
const REMOVE_AFTER_MS = 12000;

const commandSuggestions: ChatSuggestion[] = CHAT_COMMAND_SCHEMAS.map(
  (command) => ({
    value: command.primaryAlias,
    label: `/${command.primaryAlias}`,
    detail: command.summary,
  }),
).sort((left, right) => left.label.localeCompare(right.label));

const entitySuggestions: ChatSuggestion[] = getAllEntityContentEntries()
  .filter(
    ([typeId]) => typeId !== "player:base" && typeId !== "pickup:item_entity",
  )
  .map(([typeId, content]) => ({
    value: getResourcePath(typeId),
    label: content.label,
    detail: typeId,
  }))
  .sort((left, right) => left.label.localeCompare(right.label));

const itemSuggestions: ChatSuggestion[] = getAllItemContentEntries()
  .filter(([, content]) => !content.hidden)
  .map(([typeId, content]) => ({
    value: getResourcePath(typeId),
    label: content.label,
    detail: typeId,
  }))
  .sort((left, right) => left.label.localeCompare(right.label));

const effectSuggestions: ChatSuggestion[] = getAllEffectContentEntries()
  .map(([typeId, content]) => ({
    value: getResourcePath(typeId),
    label: content.label,
    detail: typeId,
  }))
  .sort((left, right) => left.label.localeCompare(right.label));

const selectorSuggestions: ChatSuggestion[] = [
  { value: "@a", label: "@a", detail: "all players" },
  { value: "@e", label: "@e", detail: "all entities" },
];

const timeActionSuggestions: ChatSuggestion[] = [
  { value: "set", label: "set", detail: "set time value" },
];

const timePeriodSuggestions: ChatSuggestion[] = [
  { value: "day", label: "day", detail: "set daytime" },
  { value: "night", label: "night", detail: "set nighttime" },
];

export function createChatController({
  elements,
  gameClient,
  hudController,
  sessionUiController,
}: ChatControllerOptions): ChatController {
  const root = elements.chatRoot;
  const linesEl = elements.chatLines;
  const input = elements.chatInput;
  const suggestionsEl = elements.chatSuggestions;

  if (!root || !linesEl || !input || !suggestionsEl) {
    return {
      setVisible: () => undefined,
      open: () => undefined,
      close: () => undefined,
      isOpen: () => false,
    };
  }

  let isOpen = false;
  const lines: ChatLine[] = [];
  const history: string[] = [];
  let historyIndex = 0;
  let historyDraft = "";
  let suggestions: ChatSuggestion[] = [];
  let selectedSuggestionIndex = 0;
  let releaseChatSuppression: (() => void) | undefined;

  const ensureOpenStateMatchesVisibility = (): void => {
    if (!isOpen) {
      return;
    }
    if (root.hidden || !root.isConnected) {
      closeChat();
    }
  };

  const rootVisibilityObserver = new MutationObserver(() => {
    ensureOpenStateMatchesVisibility();
  });
  rootVisibilityObserver.observe(root, {
    attributes: true,
    attributeFilter: ["hidden"],
  });

  const setVisible = (visible: boolean): void => {
    root.hidden = !visible;
    if (!visible) {
      closeChat();
    }
  };

  const openChat = (seedText = ""): void => {
    if (isOpen) {
      return;
    }
    isOpen = true;
    root.classList.add("is-open");
    input.value = seedText;
    historyIndex = history.length;
    historyDraft = "";
    releaseChatSuppression ??= gameClient.acquireMovementSuppression("chat");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    updateSuggestions();
    for (const line of lines) {
      clearLineTimers(line);
      line.element.classList.remove("is-faded");
    }
  };

  const closeChat = (): void => {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    root.classList.remove("is-open");
    input.blur();
    releaseChatSuppression?.();
    releaseChatSuppression = undefined;
    suggestions = [];
    renderSuggestions();
    scheduleAllLines();
  };

  const scheduleAllLines = (): void => {
    const now = Date.now();
    for (const line of lines) {
      scheduleLine(line, now);
    }
  };

  const clearLineTimers = (line: ChatLine): void => {
    if (line.fadeTimeout) {
      window.clearTimeout(line.fadeTimeout);
      line.fadeTimeout = undefined;
    }
    if (line.removeTimeout) {
      window.clearTimeout(line.removeTimeout);
      line.removeTimeout = undefined;
    }
  };

  const scheduleLine = (line: ChatLine, now = Date.now()): void => {
    clearLineTimers(line);

    if (isOpen) {
      line.element.classList.remove("is-faded");
      return;
    }

    const age = now - line.createdAt;
    const fadeDelay = Math.max(0, FADE_AFTER_MS - age);
    const removeDelay = Math.max(0, REMOVE_AFTER_MS - age);

    if (fadeDelay === 0) {
      line.element.classList.add("is-faded");
    } else {
      line.fadeTimeout = window.setTimeout(() => {
        line.element.classList.add("is-faded");
      }, fadeDelay);
    }

    if (removeDelay === 0) {
      removeLine(line);
    } else {
      line.removeTimeout = window.setTimeout(() => {
        removeLine(line);
      }, removeDelay);
    }
  };

  const removeLine = (line: ChatLine): void => {
    clearLineTimers(line);
    const index = lines.indexOf(line);
    if (index >= 0) {
      lines.splice(index, 1);
    }
    line.element.remove();
  };

  const pushLine = (message: ChatMessage): void => {
    const lineEl = document.createElement("div");
    lineEl.className = "chat-line";
    if (message.kind) {
      lineEl.classList.add(`chat-${message.kind}`);
    }
    lineEl.textContent = message.text;

    linesEl.appendChild(lineEl);
    const line: ChatLine = {
      element: lineEl,
      createdAt: Date.now(),
    };
    lines.push(line);

    while (lines.length > MAX_LINES) {
      const oldestLine = lines[0];
      if (!oldestLine) {
        break;
      }
      removeLine(oldestLine);
    }

    scheduleLine(line);
  };

  const shouldBlockEnterForMenus = (): boolean => {
    return hudController.isCraftingMenuOpen();
  };

  const isGameActive = (): boolean => {
    return (
      gameClient.isSessionReady() &&
      isPlayingSession(sessionUiController.getState())
    );
  };

  const updateSuggestions = (): void => {
    suggestions = buildSuggestions(
      input.value,
      gameClient.getOnlinePlayerNames(),
    );
    if (selectedSuggestionIndex >= suggestions.length) {
      selectedSuggestionIndex = 0;
    }
    renderSuggestions();
  };

  const renderSuggestions = (): void => {
    suggestionsEl.innerHTML = "";
    suggestionsEl.hidden = suggestions.length === 0 || !isOpen;
    if (suggestionsEl.hidden) {
      return;
    }

    suggestions.forEach((suggestion, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-suggestion";
      if (index === selectedSuggestionIndex) {
        button.classList.add("is-selected");
      }
      button.innerHTML = suggestion.detail
        ? `<strong>${escapeHtml(suggestion.label)}</strong><span>${escapeHtml(
            suggestion.detail,
          )}</span>`
        : `<strong>${escapeHtml(suggestion.label)}</strong>`;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        acceptSuggestion(suggestion);
      });
      suggestionsEl.appendChild(button);
    });
  };

  const acceptSuggestion = (suggestion: ChatSuggestion): void => {
    input.value = replaceCurrentToken(input.value, suggestion.value);
    selectedSuggestionIndex = 0;
    updateSuggestions();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };

  input.addEventListener("input", () => {
    selectedSuggestionIndex = 0;
    updateSuggestions();
  });

  input.addEventListener("blur", () => {
    if (!isOpen) {
      return;
    }
    // If focus leaves chat input, always close so movement/input state stays in sync.
    closeChat();
  });

  input.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeChat();
      return;
    }

    if (keyboardEvent.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const trimmedText = input.value.trim();
      const shouldCompleteCommand =
        shouldAcceptSuggestionOnEnter(
          input.value,
          suggestions,
          selectedSuggestionIndex,
        ) &&
        trimmedText.startsWith("/") &&
        !trimmedText.includes(" ");

      if (shouldCompleteCommand) {
        acceptSuggestion(suggestions[selectedSuggestionIndex]!);
        return;
      }

      if (trimmedText.length > 0) {
        gameClient.sendChat(trimmedText);
        history.push(trimmedText);
        historyIndex = history.length;
        historyDraft = "";
      }
      closeChat();
      return;
    }

    if (keyboardEvent.key === "Tab" && suggestions.length > 0) {
      event.preventDefault();
      acceptSuggestion(suggestions[selectedSuggestionIndex]!);
      return;
    }

    if (keyboardEvent.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      selectedSuggestionIndex =
        (selectedSuggestionIndex - 1 + suggestions.length) % suggestions.length;
      renderSuggestions();
      return;
    }

    if (keyboardEvent.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      selectedSuggestionIndex =
        (selectedSuggestionIndex + 1) % suggestions.length;
      renderSuggestions();
      return;
    }

    if (keyboardEvent.key === "ArrowUp") {
      event.preventDefault();
      if (history.length === 0) {
        return;
      }
      if (historyIndex === history.length) {
        historyDraft = input.value;
      }
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] ?? "";
      input.setSelectionRange(input.value.length, input.value.length);
      updateSuggestions();
      return;
    }

    if (keyboardEvent.key === "ArrowDown") {
      event.preventDefault();
      if (history.length === 0) {
        return;
      }
      historyIndex = Math.min(history.length, historyIndex + 1);
      if (historyIndex === history.length) {
        input.value = historyDraft;
      } else {
        input.value = history[historyIndex] ?? "";
      }
      input.setSelectionRange(input.value.length, input.value.length);
      updateSuggestions();
    }
  });

  gameClient.networkClient.onChat((message) => {
    pushLine(message);
  });

  return {
    setVisible,
    open(seedText?: string): void {
      if (!isGameActive() || (seedText === "" && shouldBlockEnterForMenus())) {
        return;
      }
      openChat(seedText);
    },
    close: closeChat,
    isOpen: () => isOpen,
  };
}

function buildSuggestions(
  value: string,
  playerNames: string[],
): ChatSuggestion[] {
  if (!value.startsWith("/")) {
    return [];
  }

  const commandState = parseCommandState(value);
  if (!commandState) {
    return [];
  }

  const { command, args, currentToken } = commandState;
  if (!command) {
    return filterAutocompleteSuggestions(commandSuggestions, currentToken);
  }

  if (args.length === 0) {
    return filterAutocompleteSuggestions(commandSuggestions, command);
  }

  const playerSuggestions = playerNames.map((playerName) => ({
    value: playerName,
    label: playerName,
  }));

  const commandId = resolveChatCommandAlias(command);
  if (!commandId) {
    return [];
  }

  const commandDefinition = getChatCommandSchemaById(commandId);
  if (!commandDefinition.autocomplete) {
    return [];
  }

  const matchedRules = matchChatAutocompleteRules(commandDefinition, args);
  if (matchedRules.length === 0) {
    return [];
  }

  const sourceSuggestions = new Map<string, ChatSuggestion>();
  for (const rule of matchedRules) {
    for (const source of rule.sources) {
      for (const suggestion of getSourceSuggestions(
        source,
        playerSuggestions,
      )) {
        sourceSuggestions.set(
          `${suggestion.value}|${suggestion.label}|${suggestion.detail ?? ""}`,
          suggestion,
        );
      }
    }
  }

  return filterAutocompleteSuggestions(
    [...sourceSuggestions.values()],
    currentToken,
  ).sort((left, right) => left.label.localeCompare(right.label));
}

function getSourceSuggestions(
  source: ChatAutocompleteSource,
  playerSuggestions: ChatSuggestion[],
): readonly ChatSuggestion[] {
  switch (source) {
    case "command":
      return commandSuggestions;
    case "entity":
      return entitySuggestions;
    case "item":
      return itemSuggestions;
    case "effect":
      return effectSuggestions;
    case "selector":
      return selectorSuggestions;
    case "player":
      return playerSuggestions;
    case "time_action":
      return timeActionSuggestions;
    case "time_period":
      return timePeriodSuggestions;
  }
}

function parseCommandState(value: string): ParsedCommandState | null {
  return parseChatAutocompleteState(value);
}

function replaceCurrentToken(value: string, replacement: string): string {
  const lastSpaceIndex = value.lastIndexOf(" ");
  if (lastSpaceIndex < 0) {
    return `/${replacement} `;
  }
  return `${value.slice(0, lastSpaceIndex + 1)}${replacement} `;
}

function shouldAcceptSuggestionOnEnter(
  value: string,
  suggestions: ChatSuggestion[],
  selectedSuggestionIndex: number,
): boolean {
  if (suggestions.length === 0) {
    return false;
  }

  const currentToken = getCurrentToken(value);
  if (currentToken.length === 0) {
    return true;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue.startsWith("/") || trimmedValue.includes(" ")) {
    return false;
  }

  const selectedSuggestion = suggestions[selectedSuggestionIndex];
  if (!selectedSuggestion) {
    return false;
  }

  return (
    normalizeSuggestionText(currentToken) !==
    normalizeSuggestionText(selectedSuggestion.value)
  );
}

function getCurrentToken(value: string): string {
  const trimmedRight = value.trimEnd();
  const lastSpaceIndex = trimmedRight.lastIndexOf(" ");
  if (lastSpaceIndex < 0) {
    return trimmedRight.replace(/^\//, "");
  }
  return trimmedRight.slice(lastSpaceIndex + 1);
}

function normalizeSuggestionText(value: string): string {
  return value.replace(/[\s_/-]+/g, "").toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
