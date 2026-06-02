import { getItemRendering, getWeaponContent } from "@shared/content/catalog.ts";
import {
  KATANA_COMBO_LENGTH,
  KATANA_STAB_STEP_INDEX,
  shouldResetKatanaComboByCooldownMs,
} from "@shared/gameplay/katanaCombo.ts";
import type {
  EquippedAnimatedSyncInput,
  EquippedItemRenderer,
  EquippedRenderContext,
  EquippedStaticSyncInput,
} from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { BaseEquippedItemRenderer } from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { toRadians } from "@client/render/entity/equipped/equippedMath.ts";
import {
  katanaChainBreakRecoverRotationOffset,
  katanaStabComboPose,
  katanaSweepDownRotationOffset,
  katanaSweepUpRotationOffset,
  resolveKatanaSwingOffsets,
} from "@client/render/entity/equipped/katanaEquippedAnimation.ts";

type KatanaComboPhase = "sweepDown" | "sweepUp" | "stab";

type ChainBreakRecoverState = {
  fromRotationOffset: number;
  startMs: number;
  durationMs: number;
};

type EntityKatanaState = {
  comboStep: number;
  lastAttackMs: number | null;
  activePhase: KatanaComboPhase | null;
  attackInProgress: boolean;
  /** Held arc between chained attacks; cleared when recover starts or combo finishes. */
  carryRotationOffset: number | null;
  chainBreakRecover: ChainBreakRecoverState | null;
};

/**
 * Held katana combo: sweep down and hold, sweep back to center, then a fast
 * middle stab with recover-and-rise. No idle recovery between chained steps;
 * a separate recover plays when the chain window expires without another attack.
 */
export class KatanaEquippedRenderer
  extends BaseEquippedItemRenderer
  implements EquippedItemRenderer
{
  private readonly stateByEntityId = new Map<number, EntityKatanaState>();

  public override syncStatic(input: EquippedStaticSyncInput): void {
    super.syncStatic(input);
    const state = this.getOrCreateState(input.entity.id);
    this.syncIdleOrCarryOrRecover(input, state);
  }

  public override syncAnimated(input: EquippedAnimatedSyncInput): void {
    const state = this.getOrCreateState(input.entity.id);
    const phase = state.activePhase;

    this.beginChainBreakRecoverIfNeeded(input, state);

    if (!phase) {
      this.syncIdleOrCarryOrRecover(input, state);
      return;
    }

    const offsets = resolveKatanaSwingOffsets(
      input.renderManifest,
      input.facingLeft,
    );

    if (input.progress >= 0.999) {
      this.finishAttackPhase(state, phase, offsets);
      this.syncIdleOrCarryOrRecover(input, state);
      return;
    }

    const baseRotation =
      input.rotation +
      toRadians(input.renderManifest.rotationDeg) +
      (input.facingLeft ? Math.PI : 0);

    if (phase === "stab") {
      const stabPose = katanaStabComboPose(
        input.progress,
        offsets,
        input.renderManifest,
        this.resolveStabJabDistance(input.typeId),
        input.mirrorSign,
      );
      input.sprite.position.set(stabPose.spriteX, stabPose.spriteY);
      input.container.rotation = baseRotation + stabPose.rotationOffset;
      return;
    }

    const rotationOffset =
      phase === "sweepDown"
        ? katanaSweepDownRotationOffset(input.progress, offsets)
        : katanaSweepUpRotationOffset(input.progress, offsets);
    input.sprite.position.set(
      input.renderManifest.x * (input.mirrorSign === 1 ? 1 : -1),
      input.renderManifest.y,
    );
    input.container.rotation = baseRotation + rotationOffset;
  }

  public onAttackStart(context: EquippedRenderContext): void {
    const state = this.getOrCreateState(context.entity.id);
    if (state.attackInProgress) {
      return;
    }

    const weaponContent = getWeaponContent(context.typeId);
    const comboContent =
      weaponContent?.attackStyle === "swing"
        ? weaponContent.combo
        : undefined;
    if (!comboContent) {
      return;
    }

    const nowMs = performance.now();
    state.chainBreakRecover = null;

    if (
      shouldResetKatanaComboByCooldownMs(
        comboContent,
        context.attackAnimationDurationMs,
        state.lastAttackMs,
        nowMs,
      )
    ) {
      state.comboStep = 0;
      state.carryRotationOffset = null;
    }

    state.activePhase = this.resolvePhaseForComboStep(state.comboStep);
    state.attackInProgress = true;
    state.lastAttackMs = nowMs;
    state.comboStep = (state.comboStep + 1) % KATANA_COMBO_LENGTH;
  }

  private beginChainBreakRecoverIfNeeded(
    input: EquippedAnimatedSyncInput,
    state: EntityKatanaState,
  ): void {
    if (
      state.attackInProgress ||
      state.chainBreakRecover !== null ||
      state.carryRotationOffset === null ||
      state.lastAttackMs === null
    ) {
      return;
    }

    const weaponContent = getWeaponContent(input.typeId);
    const comboContent =
      weaponContent?.attackStyle === "swing"
        ? weaponContent.combo
        : undefined;
    if (!comboContent) {
      return;
    }

    if (
      !shouldResetKatanaComboByCooldownMs(
        comboContent,
        input.attackAnimationDurationMs,
        state.lastAttackMs,
        performance.now(),
      )
    ) {
      return;
    }

    state.chainBreakRecover = {
      fromRotationOffset: state.carryRotationOffset,
      startMs: performance.now(),
      durationMs: input.attackAnimationDurationMs,
    };
    state.carryRotationOffset = null;
    state.comboStep = 0;
  }

  private syncIdleOrCarryOrRecover(
    input: EquippedAnimatedSyncInput | EquippedStaticSyncInput,
    state: EntityKatanaState,
  ): void {
    const offsets = resolveKatanaSwingOffsets(
      input.renderManifest,
      input.facingLeft,
    );

    const recover = state.chainBreakRecover;
    if (recover) {
      const elapsedMs = performance.now() - recover.startMs;
      const progress = elapsedMs / Math.max(1, recover.durationMs);
      const rotationOffset = katanaChainBreakRecoverRotationOffset(
        progress,
        recover.fromRotationOffset,
        offsets.startOffset,
      );
      this.applyPose(input, rotationOffset);
      if (progress >= 1) {
        state.chainBreakRecover = null;
      }
      return;
    }

    this.applyPose(input, state.carryRotationOffset);
  }

  private finishAttackPhase(
    state: EntityKatanaState,
    phase: KatanaComboPhase,
    offsets: ReturnType<typeof resolveKatanaSwingOffsets>,
  ): void {
    state.attackInProgress = false;
    state.activePhase = null;

    if (phase === "sweepDown") {
      state.carryRotationOffset = offsets.endOffset;
      return;
    }

    if (phase === "sweepUp") {
      state.carryRotationOffset = offsets.startOffset;
      return;
    }

    state.carryRotationOffset = null;
  }

  private resolvePhaseForComboStep(comboStep: number): KatanaComboPhase {
    if (comboStep === KATANA_STAB_STEP_INDEX) {
      return "stab";
    }
    if (comboStep === 1) {
      return "sweepUp";
    }
    return "sweepDown";
  }

  private applyPose(
    input: EquippedAnimatedSyncInput | EquippedStaticSyncInput,
    rotationOffset: number | null,
  ): void {
    const offsets = resolveKatanaSwingOffsets(
      input.renderManifest,
      input.facingLeft,
    );
    const resolvedOffset = rotationOffset ?? offsets.startOffset;
    input.sprite.position.set(
      input.renderManifest.x * (input.mirrorSign === 1 ? 1 : -1),
      input.renderManifest.y,
    );
    input.container.rotation =
      input.rotation +
      toRadians(input.renderManifest.rotationDeg) +
      resolvedOffset +
      (input.facingLeft ? Math.PI : 0);
  }

  private resolveStabJabDistance(typeId: EquippedRenderContext["typeId"]): number {
    const comboStab = getItemRendering(typeId)?.comboStab;
    if (!comboStab) {
      throw new Error(`Katana rendering is missing comboStab tuning for ${typeId}.`);
    }
    return comboStab.jabDistance;
  }

  private getOrCreateState(entityId: number): EntityKatanaState {
    const existing = this.stateByEntityId.get(entityId);
    if (existing) {
      return existing;
    }
    const created: EntityKatanaState = {
      comboStep: 0,
      lastAttackMs: null,
      activePhase: null,
      attackInProgress: false,
      carryRotationOffset: null,
      chainBreakRecover: null,
    };
    this.stateByEntityId.set(entityId, created);
    return created;
  }
}
