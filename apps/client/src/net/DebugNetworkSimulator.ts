export type DebugNetworkProfileName = "perfect" | "mild" | "bad";

export type DebugNetworkProfile = {
  name: DebugNetworkProfileName;
  addedLatencyMs: number;
  jitterMs: number;
  packetLossRate: number;
  duplicateRate: number;
  reorderRate: number;
  reorderExtraDelayMs: number;
};

export type DebugNetworkMetrics = {
  enabled: boolean;
  seed: number;
  profile: DebugNetworkProfile;
  sentPacketCount: number;
  deliveredPacketCount: number;
  droppedPacketCount: number;
  duplicatedPacketCount: number;
  reorderedPacketCount: number;
};

type PlannedDelivery = {
  payload: string;
  delayMs: number;
  duplicate: boolean;
  reordered: boolean;
};

const DEBUG_NETWORK_PROFILES: Record<
  DebugNetworkProfileName,
  DebugNetworkProfile
> = {
  perfect: {
    name: "perfect",
    addedLatencyMs: 0,
    jitterMs: 0,
    packetLossRate: 0,
    duplicateRate: 0,
    reorderRate: 0,
    reorderExtraDelayMs: 0,
  },
  mild: {
    name: "mild",
    addedLatencyMs: 50,
    jitterMs: 20,
    packetLossRate: 0.01,
    duplicateRate: 0.01,
    reorderRate: 0.015,
    reorderExtraDelayMs: 35,
  },
  bad: {
    name: "bad",
    addedLatencyMs: 125,
    jitterMs: 55,
    packetLossRate: 0.04,
    duplicateRate: 0.03,
    reorderRate: 0.05,
    reorderExtraDelayMs: 90,
  },
};

export function getDebugNetworkProfile(
  profileName: DebugNetworkProfileName,
): DebugNetworkProfile {
  return { ...DEBUG_NETWORK_PROFILES[profileName] };
}

export function parseDebugNetworkProfileName(
  value: string | null | undefined,
): DebugNetworkProfileName | null {
  if (value === "perfect" || value === "A") {
    return "perfect";
  }
  if (value === "mild" || value === "B") {
    return "mild";
  }
  if (value === "bad" || value === "C") {
    return "bad";
  }
  return null;
}

export class DebugNetworkSimulator {
  private profile = getDebugNetworkProfile("perfect");
  private enabled = false;
  private rngState = 1;
  private seed = 1;
  private sentPacketCount = 0;
  private deliveredPacketCount = 0;
  private droppedPacketCount = 0;
  private duplicatedPacketCount = 0;
  private reorderedPacketCount = 0;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  public configure(options: {
    profileName: DebugNetworkProfileName;
    enabled?: boolean;
    seed?: number;
  }): void {
    this.clearTimers();
    this.profile = getDebugNetworkProfile(options.profileName);
    this.enabled = options.enabled ?? true;
    this.seed = normalizeSeed(options.seed ?? 1);
    this.rngState = this.seed;
    this.sentPacketCount = 0;
    this.deliveredPacketCount = 0;
    this.droppedPacketCount = 0;
    this.duplicatedPacketCount = 0;
    this.reorderedPacketCount = 0;
  }

  public disable(): void {
    this.clearTimers();
    this.enabled = false;
  }

  public deliver(payload: string, callback: (payload: string) => void): void {
    const deliveries = this.planDeliveries(payload);
    for (const delivery of deliveries) {
      if (delivery.delayMs <= 0) {
        this.deliveredPacketCount += 1;
        callback(delivery.payload);
        continue;
      }

      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.deliveredPacketCount += 1;
        callback(delivery.payload);
      }, delivery.delayMs);
      this.timers.add(timer);
    }
  }

  public planDeliveries(payload: string): PlannedDelivery[] {
    this.sentPacketCount += 1;
    if (!this.enabled) {
      return [
        {
          payload,
          delayMs: 0,
          duplicate: false,
          reordered: false,
        },
      ];
    }

    if (this.nextRandom() < this.profile.packetLossRate) {
      this.droppedPacketCount += 1;
      return [];
    }

    const deliveries = [this.createDelivery(payload, false)];
    if (this.nextRandom() < this.profile.duplicateRate) {
      this.duplicatedPacketCount += 1;
      deliveries.push(this.createDelivery(payload, true));
    }
    return deliveries;
  }

  public getMetrics(): DebugNetworkMetrics {
    return {
      enabled: this.enabled,
      seed: this.seed,
      profile: { ...this.profile },
      sentPacketCount: this.sentPacketCount,
      deliveredPacketCount: this.deliveredPacketCount,
      droppedPacketCount: this.droppedPacketCount,
      duplicatedPacketCount: this.duplicatedPacketCount,
      reorderedPacketCount: this.reorderedPacketCount,
    };
  }

  private createDelivery(payload: string, duplicate: boolean): PlannedDelivery {
    const jitterOffset =
      this.profile.jitterMs <= 0
        ? 0
        : (this.nextRandom() * 2 - 1) * this.profile.jitterMs;
    let delayMs = Math.max(0, this.profile.addedLatencyMs + jitterOffset);
    const reordered = this.nextRandom() < this.profile.reorderRate;
    if (reordered) {
      delayMs += this.profile.reorderExtraDelayMs;
      this.reorderedPacketCount += 1;
    }
    if (duplicate) {
      delayMs += 1 + Math.floor(this.nextRandom() * 8);
    }
    return {
      payload,
      delayMs,
      duplicate,
      reordered,
    };
  }

  private nextRandom(): number {
    this.rngState = (1664525 * this.rngState + 1013904223) >>> 0;
    return this.rngState / 0x100000000;
  }

  private clearTimers(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    return 1;
  }
  const normalized = Math.floor(Math.abs(seed)) >>> 0;
  return normalized === 0 ? 1 : normalized;
}
