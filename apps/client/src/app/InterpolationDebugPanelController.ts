import type { GameClient } from "@client/client/GameClient.ts";
import type { GameConfig } from "@shared/config/GameConfig.ts";

type InterpolationConfig = GameConfig["interpolation"];
type InterpolationKey = keyof InterpolationConfig;

type InterpolationOption = {
  key: InterpolationKey;
  label: string;
  min: number;
  max: number;
  step: number;
  precision: number;
  integer?: boolean;
  info: string;
};

export type InterpolationDebugPanelController = {
  syncState(options: {
    menuVisible: boolean;
    configuredPlayerName: string | null;
    resolvedPlayerName: string | null;
  }): void;
};

const INTERPOLATION_OPTIONS: readonly InterpolationOption[] = [
  {
    key: "historySize",
    label: "historySize",
    min: 2,
    max: 32,
    step: 1,
    precision: 0,
    integer: true,
    info: "How many snapshots are kept for interpolation. Higher keeps more history and smooths jitter recovery; lower is lighter but can increase hold/extrapolate behavior.",
  },
  {
    key: "snapDistance",
    label: "snapDistance",
    min: 16,
    max: 512,
    step: 1,
    precision: 0,
    info: "Base distance budget for hard snaps. Higher tolerates larger authority error before snapping; lower snaps back to server state sooner.",
  },
  {
    key: "tickDurationSmoothing",
    label: "tickDurationSmoothing",
    min: 0.01,
    max: 1,
    step: 0.01,
    precision: 2,
    info: "EWMA smoothing for measured tick duration. Higher adapts faster to cadence shifts but is noisier; lower is steadier but reacts slower.",
  },
  {
    key: "tickDurationMinFactor",
    label: "tickDurationMinFactor",
    min: 0.2,
    max: 2,
    step: 0.01,
    precision: 2,
    info: "Lower clamp factor for measured tick duration. Higher forces a tighter lower bound; lower allows shorter measured ticks before clamping.",
  },
  {
    key: "tickDurationMaxFactor",
    label: "tickDurationMaxFactor",
    min: 0.3,
    max: 3,
    step: 0.01,
    precision: 2,
    info: "Upper clamp factor for measured tick duration. Higher allows bigger tick-duration spikes before clamping; lower stabilizes timing but can underreact.",
  },
  {
    key: "minRenderDelayTicks",
    label: "minRenderDelayTicks",
    min: 0,
    max: 6,
    step: 0.05,
    precision: 2,
    info: "Minimum render delay behind estimated server time. Higher raises baseline smoothness but adds latency; lower reduces latency but tightens jitter headroom.",
  },
  {
    key: "maxRenderDelayTicks",
    label: "maxRenderDelayTicks",
    min: 0,
    max: 6,
    step: 0.05,
    precision: 2,
    info: "Maximum adaptive render delay. Higher resists jitter spikes and snapping but increases visual latency; lower keeps latency down with less jitter protection.",
  },
  {
    key: "renderDelaySmoothing",
    label: "renderDelaySmoothing",
    min: 0.01,
    max: 1,
    step: 0.01,
    precision: 2,
    info: "Smoothing for delay adaptation. Higher follows jitter changes quickly but can feel elastic; lower changes delay more smoothly but reacts slower.",
  },
  {
    key: "arrivalEwmaSmoothing",
    label: "arrivalEwmaSmoothing",
    min: 0.01,
    max: 1,
    step: 0.01,
    precision: 2,
    info: "Smoothing for snapshot arrival interval. Higher tracks recent cadence quickly but is sensitive to noise; lower gives a steadier baseline.",
  },
  {
    key: "jitterEwmaSmoothing",
    label: "jitterEwmaSmoothing",
    min: 0.01,
    max: 1,
    step: 0.01,
    precision: 2,
    info: "Smoothing for jitter estimate. Higher reacts to burstiness faster; lower keeps jitter estimate calmer and slower.",
  },
  {
    key: "jitterBufferMultiplier",
    label: "jitterBufferMultiplier",
    min: 0,
    max: 6,
    step: 0.05,
    precision: 2,
    info: "Multiplier applied to measured jitter when computing playout delay. Higher improves jitter tolerance with more delay; lower trims delay with less protection.",
  },
  {
    key: "jitterBufferSafetyMs",
    label: "jitterBufferSafetyMs",
    min: 0,
    max: 64,
    step: 1,
    precision: 0,
    info: "Fixed safety margin added to playout delay. Higher guards against outliers; lower reduces latency but removes cushion.",
  },
  {
    key: "maxExtrapolationTicks",
    label: "maxExtrapolationTicks",
    min: 0,
    max: 2,
    step: 0.05,
    precision: 2,
    info: "How far extrapolation is allowed when rendering ahead of newest snapshot. Higher reduces short-gap stalls but increases misprediction risk; lower sticks closer to authority.",
  },
  {
    key: "correctionFollowSharpness",
    label: "correctionFollowSharpness",
    min: 0.1,
    max: 60,
    step: 0.1,
    precision: 1,
    info: "How aggressively non-snap correction follows target positions. Higher converges faster and feels snappier; lower is smoother but trails more.",
  },
  {
    key: "correctionEpsilon",
    label: "correctionEpsilon",
    min: 0,
    max: 0.1,
    step: 0.001,
    precision: 3,
    info: "Deadzone where tiny error is snapped directly to target. Higher suppresses micro-jitter; lower keeps tighter precision with more tiny adjustments.",
  },
  {
    key: "correctionFrameScaleMin",
    label: "correctionFrameScaleMin",
    min: 0.01,
    max: 2,
    step: 0.01,
    precision: 2,
    info: "Minimum delta-time correction scale. Higher enforces stronger correction on short frames; lower allows gentler correction at high FPS.",
  },
  {
    key: "correctionFrameScaleMax",
    label: "correctionFrameScaleMax",
    min: 0.1,
    max: 4,
    step: 0.01,
    precision: 2,
    info: "Maximum delta-time correction scale. Higher allows larger catch-up after hitches; lower avoids big one-frame corrections.",
  },
  {
    key: "maxDebugLogEntries",
    label: "maxDebugLogEntries",
    min: 100,
    max: 5000,
    step: 50,
    precision: 0,
    integer: true,
    info: "How many interpolation debug frames are kept in memory. Higher gives longer tuning history; lower reduces memory use.",
  },
] as const;

const OPTION_BY_KEY = new Map<InterpolationKey, InterpolationOption>(
  INTERPOLATION_OPTIONS.map((option) => [option.key, option]),
);

export function createInterpolationDebugPanelController(options: {
  gameClient: GameClient;
  hostElement: HTMLElement | null;
}): InterpolationDebugPanelController {
  const { gameClient, hostElement } = options;
  if (!hostElement) {
    return {
      syncState: () => undefined,
    };
  }

  const panel = document.createElement("section");
  panel.className = "interp-debug-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Interpolation debug controls");

  const title = document.createElement("h3");
  title.className = "interp-debug-title";
  title.textContent = "Interpolation Debug";

  const hint = document.createElement("p");
  hint.className = "interp-debug-hint";
  hint.textContent =
    "Live interpolation tuning. Visible only when player name is debug.";

  const list = document.createElement("div");
  list.className = "interp-debug-list";
  panel.append(title, hint, list);

  const sliderByKey = new Map<InterpolationKey, HTMLInputElement>();
  const valueLabelByKey = new Map<InterpolationKey, HTMLSpanElement>();

  for (const option of INTERPOLATION_OPTIONS) {
    const row = document.createElement("section");
    row.className = "interp-debug-option";

    const header = document.createElement("div");
    header.className = "interp-debug-option-header";

    const labelGroup = document.createElement("div");
    labelGroup.className = "interp-debug-label-group";

    const label = document.createElement("span");
    label.className = "interp-debug-label";
    label.textContent = option.label;

    const help = document.createElement("button");
    help.type = "button";
    help.className = "interp-debug-help";
    help.textContent = "i";
    help.dataset.tooltip = option.info;
    help.title = option.info;
    help.setAttribute("aria-label", `About ${option.label}`);

    labelGroup.append(label, help);

    const valueLabel = document.createElement("span");
    valueLabel.className = "interp-debug-value";
    valueLabel.textContent = "-";

    header.append(labelGroup, valueLabel);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "interp-debug-slider";
    slider.min = String(option.min);
    slider.max = String(option.max);
    slider.step = String(option.step);
    slider.value = String(option.min);
    slider.addEventListener("input", () => {
      const nextValue = Number(slider.value);
      if (!Number.isFinite(nextValue)) {
        return;
      }
      applyOptionValue(option.key, nextValue);
    });

    row.append(header, slider);
    list.appendChild(row);
    sliderByKey.set(option.key, slider);
    valueLabelByKey.set(option.key, valueLabel);
  }

  hostElement.appendChild(panel);

  function syncFromConfig(): void {
    const interpolation = gameClient.gameConfig.interpolation;
    for (const option of INTERPOLATION_OPTIONS) {
      const slider = sliderByKey.get(option.key);
      const valueLabel = valueLabelByKey.get(option.key);
      if (!slider || !valueLabel) {
        continue;
      }

      const nextValue = normalizeOptionValue(option.key, interpolation[option.key]);
      slider.value = String(nextValue);
      valueLabel.textContent = formatOptionValue(option, nextValue);
    }
  }

  function applyOptionValue(key: InterpolationKey, rawValue: number): void {
    const currentConfig = gameClient.gameConfig.interpolation;
    const nextConfig: InterpolationConfig = {
      ...currentConfig,
      [key]: normalizeOptionValue(key, rawValue),
    };

    normalizeInterpolationConfig(nextConfig);
    gameClient.setInterpolationConfig(nextConfig);
    syncFromConfig();
  }

  return {
    syncState({ menuVisible, configuredPlayerName, resolvedPlayerName }): void {
      const hasDebugName =
        normalizeName(configuredPlayerName) === "debug" ||
        normalizeName(resolvedPlayerName) === "debug";
      const shouldShow = !menuVisible && hasDebugName;

      panel.hidden = !shouldShow;
      if (!shouldShow) {
        return;
      }

      syncFromConfig();
    },
  };
}

function normalizeInterpolationConfig(config: InterpolationConfig): void {
  for (const option of INTERPOLATION_OPTIONS) {
    config[option.key] = normalizeOptionValue(option.key, config[option.key]);
  }

  config.maxRenderDelayTicks = normalizeOptionValue(
    "maxRenderDelayTicks",
    Math.max(config.maxRenderDelayTicks, config.minRenderDelayTicks),
  );
  config.tickDurationMaxFactor = normalizeOptionValue(
    "tickDurationMaxFactor",
    Math.max(config.tickDurationMaxFactor, config.tickDurationMinFactor + 0.01),
  );
  config.correctionFrameScaleMax = normalizeOptionValue(
    "correctionFrameScaleMax",
    Math.max(config.correctionFrameScaleMax, config.correctionFrameScaleMin),
  );
}

function normalizeOptionValue(key: InterpolationKey, rawValue: number): number {
  const option = getOption(key);
  const clamped = clamp(rawValue, option.min, option.max);
  if (option.integer) {
    return Math.round(clamped);
  }
  return clamped;
}

function formatOptionValue(option: InterpolationOption, value: number): string {
  if (option.integer) {
    return String(Math.round(value));
  }
  return trimTrailingZeros(value.toFixed(option.precision));
}

function getOption(key: InterpolationKey): InterpolationOption {
  const option = OPTION_BY_KEY.get(key);
  if (!option) {
    throw new Error(`Missing interpolation option config for ${String(key)}`);
  }
  return option;
}

function normalizeName(name: string | null): string {
  return (name ?? "").trim().toLowerCase();
}

function trimTrailingZeros(value: string): string {
  return value.includes(".")
    ? value.replace(/\.0+$/, "").replace(/(\.\d*?[1-9])0+$/, "$1")
    : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
