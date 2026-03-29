import {
  cloneHitboxRects,
  getHitboxBounds,
  getHitboxDirectionalExtent,
  offsetHitboxBounds,
  resolveHitboxRects,
  type HitboxBounds,
  type HitboxRect,
  type ResolvedHitboxRect,
} from "@shared/geometry/hitbox.ts";

export type HitboxProfiles = Record<string, readonly HitboxRect[]>;

type CachedHitboxProfile = {
  rects: HitboxRect[];
  bounds: HitboxBounds;
};

export class CompositeHitbox {
  private readonly profiles = new Map<string, CachedHitboxProfile>();
  private activeProfileName = "default";

  constructor(profiles?: HitboxProfiles, activeProfileName = "default") {
    if (profiles) {
      this.replaceProfiles(profiles, activeProfileName);
    }
  }

  public replaceProfiles(
    profiles: HitboxProfiles,
    activeProfileName = "default",
  ): void {
    this.profiles.clear();
    for (const [profileName, rects] of Object.entries(profiles)) {
      this.setProfileRects(profileName, rects);
    }
    this.setActiveProfile(activeProfileName);
  }

  public setProfileRects(
    profileName: string,
    rects: readonly HitboxRect[],
  ): void {
    const clonedRects = cloneHitboxRects(rects);
    this.profiles.set(profileName, {
      rects: clonedRects,
      bounds: getHitboxBounds(clonedRects),
    });

    if (this.profiles.size === 1) {
      this.activeProfileName = profileName;
    }
  }

  public setActiveProfile(profileName: string): void {
    this.requireProfile(profileName);
    this.activeProfileName = profileName;
  }

  public getLocalHitboxes(): readonly HitboxRect[] {
    return this.requireActiveProfile().rects;
  }

  public getWorldHitboxes(x: number, y: number): ResolvedHitboxRect[] {
    return resolveHitboxRects(x, y, this.getLocalHitboxes());
  }

  public getLocalBounds(): HitboxBounds {
    return this.requireActiveProfile().bounds;
  }

  public getWorldBounds(x: number, y: number): HitboxBounds {
    return offsetHitboxBounds(this.getLocalBounds(), x, y);
  }

  public getDirectionalExtent(directionX: number, directionY: number): number {
    return getHitboxDirectionalExtent(
      this.getLocalHitboxes(),
      directionX,
      directionY,
    );
  }

  private requireActiveProfile(): CachedHitboxProfile {
    return this.requireProfile(this.activeProfileName);
  }

  private requireProfile(profileName: string): CachedHitboxProfile {
    const profile = this.profiles.get(profileName);
    if (!profile) {
      throw new Error(`Unknown hitbox profile: ${profileName}`);
    }
    return profile;
  }
}
