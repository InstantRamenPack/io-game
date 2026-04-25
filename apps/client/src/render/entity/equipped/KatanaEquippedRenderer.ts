import type {
  EquippedAnimatedSyncInput,
  EquippedItemRenderer,
  EquippedRenderContext,
  EquippedStaticSyncInput,
} from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { StabMeleeEquippedRenderer } from "@client/render/entity/equipped/StabMeleeEquippedRenderer.ts";
import { SweepMeleeEquippedRenderer } from "@client/render/entity/equipped/SweepMeleeEquippedRenderer.ts";

type KatanaAttackMode = "swing" | "jab";

const COMBO_LENGTH = 3;
const STAB_STEP_INDEX = 2;

/**
 * Replays the katana's server-side combo rhythm locally so the third hit uses
 * the stab animation instead of another sweep.
 */
export class KatanaEquippedRenderer implements EquippedItemRenderer {
  private readonly sweepRenderer = new SweepMeleeEquippedRenderer();
  private readonly stabRenderer = new StabMeleeEquippedRenderer();
  private readonly comboStepByEntityId = new Map<number, number>();
  private readonly activeAttackModeByEntityId = new Map<
    number,
    KatanaAttackMode
  >();

  public syncStatic(input: EquippedStaticSyncInput): void {
    this.sweepRenderer.syncStatic(input);
  }

  public syncAnimated(input: EquippedAnimatedSyncInput): void {
    const isAttackActive = input.progress < 0.999;
    const attackMode = isAttackActive
      ? this.activeAttackModeByEntityId.get(input.entity.id)
      : undefined;

    if (attackMode === "jab") {
      this.stabRenderer.syncAnimated(input);
      return;
    }

    this.sweepRenderer.syncAnimated(input);
  }

  public onAttackStart(context: EquippedRenderContext): void {
    const comboStep = this.comboStepByEntityId.get(context.entity.id) ?? 0;
    const attackMode: KatanaAttackMode =
      comboStep === STAB_STEP_INDEX ? "jab" : "swing";

    this.activeAttackModeByEntityId.set(context.entity.id, attackMode);
    this.comboStepByEntityId.set(
      context.entity.id,
      (comboStep + 1) % COMBO_LENGTH,
    );
  }
}
