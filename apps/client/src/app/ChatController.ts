import type { AppElements } from "@client/app/AppElements.ts";
import type { HudController } from "@client/app/HudController.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import {
  getAllEffectContentEntries,
  getAllEntityContentEntries,
  getAllItemContentEntries,
} from "@shared/content/catalog.ts";
import { getResourcePath } from "@shared/ids/ResourceId.ts";
import type { ChatMessage } from "@shared/net/protocol.ts";

export type ChatController = {
  setVisible: (visible: boolean) => void;
};

type ChatControllerOptions = {
  elements: AppElements;
  gameClient: GameClient;
  hudController: HudController;
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

const MAX_LINES = 8;
const FADE_AFTER_MS = 8000;
const REMOVE_AFTER_MS = 12000;

const commandSuggestions: ChatSuggestion[] = [
  { value: "effect", label: "/effect" },
  { value: "give", label: "/give" },
  { value: "help", label: "/help" },
  { value: "kill", label: "/kill" },
  { value: "killall", label: "/killall" },
  { value: "list", label: "/list" },
  { value: "me", label: "/me" },
  { value: "r", label: "/r" },
  { value: "say", label: "/say" },
  { value: "spawn", label: "/spawn" },
  { value: "w", label: "/w" },
].sort((left, right) => left.label.localeCompare(right.label));

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

export function createChatController({
  elements,
  gameClient,
  hudController,
}: ChatControllerOptions): ChatController {
  const root = elements.chatRoot;
  const linesEl = elements.chatLines;
  const input = elements.chatInput;
  const suggestionsEl = elements.chatSuggestions;

  if (!root || !linesEl || !input || !suggestionsEl) {
    return {
      setVisible: () => undefined,
    };
  }

  let isOpen = false;
  const lines: ChatLine[] = [];
  const history: string[] = [];
  let historyIndex = 0;
  let historyDraft = "";
  let suggestions: ChatSuggestion[] = [];
  let selectedSuggestionIndex = 0;

  const setVisible = (visible: boolean): void => {
    root.hidden = !visible;
    if (!visible) {
      closeChat();
    }
  };

  const openChat = (): void => {
    if (isOpen) {
      return;
    }
    isOpen = true;
    root.classList.add("is-open");
    input.value = "";
    historyIndex = history.length;
    historyDraft = "";
    input.focus();
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
      gameClient.isSessionReady() && elements.menuRoot?.style.display === "none"
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

  window.addEventListener("keydown", (event) => {
    if (event.repeat) {
      return;
    }
    const key = event.key.toLowerCase();

    if (isOpen) {
      if (key === "enter") {
        event.preventDefault();
        event.stopPropagation();
        if (
          shouldAcceptSuggestionOnEnter(
            input.value,
            suggestions,
            selectedSuggestionIndex,
          )
        ) {
          acceptSuggestion(suggestions[selectedSuggestionIndex]!);
          return;
        }

        const text = input.value.trim();
        if (text.length > 0) {
          gameClient.networkClient.sendChat(text);
          history.push(text);
          historyIndex = history.length;
          historyDraft = "";
        }
        closeChat();
      } else if (key === "escape") {
        event.preventDefault();
        event.stopPropagation();
        closeChat();
      }
      return;
    }

    if (!isGameActive()) {
      return;
    }

    if (key === "enter") {
      if (shouldBlockEnterForMenus()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openChat();
      return;
    }

    if (key === "/") {
      event.preventDefault();
      event.stopPropagation();
      openChat();
      input.value = "/";
      input.setSelectionRange(input.value.length, input.value.length);
      updateSuggestions();
      return;
    }

    if (key === "t") {
      event.preventDefault();
      event.stopPropagation();
      openChat();
    }
  });

  input.addEventListener("input", () => {
    selectedSuggestionIndex = 0;
    updateSuggestions();
  });

  input.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === "Escape") {
      event.preventDefault();
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
    return filterSuggestions(commandSuggestions, currentToken);
  }

  if (args.length === 0) {
    return filterSuggestions(commandSuggestions, command);
  }

  const playerSuggestions = playerNames.map((playerName) => ({
    value: playerName,
    label: playerName,
  }));

  switch (command) {
    case "kill":
      if (args.length === 1) {
        return filterSuggestions(
          [...selectorSuggestions, ...playerSuggestions].sort((left, right) =>
            left.label.localeCompare(right.label),
          ),
          currentToken,
        );
      }
      if ((args[0] ?? "").toLowerCase() === "@e" && args.length === 2) {
        return filterSuggestions(entitySuggestions, currentToken);
      }
      return [];
    case "spawn":
      if (args.length === 1) {
        return filterSuggestions(entitySuggestions, currentToken);
      }
      if (args.length === 3) {
        return filterSuggestions(
          [...selectorSuggestions, ...playerSuggestions].sort((left, right) =>
            left.label.localeCompare(right.label),
          ),
          currentToken,
        );
      }
      return [];
    case "effect":
      if (args.length === 1) {
        return filterSuggestions(effectSuggestions, currentToken);
      }
      if (args.length === 2) {
        return filterSuggestions(
          [...selectorSuggestions, ...playerSuggestions].sort((left, right) =>
            left.label.localeCompare(right.label),
          ),
          currentToken,
        );
      }
      return [];
    case "give":
      if (args.length === 1) {
        return filterSuggestions(
          [...selectorSuggestions, ...playerSuggestions].sort((left, right) =>
            left.label.localeCompare(right.label),
          ),
          currentToken,
        );
      }
      if (args.length === 2) {
        return filterSuggestions(itemSuggestions, currentToken);
      }
      return [];
    default:
      return [];
  }
}

function filterSuggestions(
  source: ChatSuggestion[],
  partial: string,
): ChatSuggestion[] {
  const normalizedPartial = normalizeSuggestionText(partial);
  return source.filter((suggestion) => {
    if (normalizedPartial.length === 0) {
      return true;
    }
    return (
      normalizeSuggestionText(suggestion.value).includes(normalizedPartial) ||
      normalizeSuggestionText(suggestion.label).includes(normalizedPartial) ||
      normalizeSuggestionText(suggestion.detail ?? "").includes(
        normalizedPartial,
      )
    );
  });
}

function parseCommandState(value: string): {
  command: string;
  args: string[];
  currentToken: string;
} | null {
  const trimmedRight = value.trimEnd();
  const hasTrailingSpace = value.endsWith(" ");
  const raw = trimmedRight.slice(1);
  const parts = raw.length > 0 ? raw.split(/\s+/g) : [];
  if (hasTrailingSpace) {
    parts.push("");
  }

  const command = (parts[0] ?? "").toLowerCase();
  const args = parts.slice(1);
  const currentToken =
    args.length > 0 ? (args[args.length - 1] ?? "") : command;
  return {
    command,
    args,
    currentToken,
  };
}

function replaceCurrentToken(value: string, replacement: string): string {
  const trimmedRight = value.trimEnd();
  const lastSpaceIndex = trimmedRight.lastIndexOf(" ");
  if (lastSpaceIndex < 0) {
    return `/${replacement} `;
  }
  return `${trimmedRight.slice(0, lastSpaceIndex + 1)}${replacement} `;
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
