import type { MovementSuppressionReason } from "@client/input/MovementSuppressionReason.ts";

type BlockToken = symbol;
type BlockListener = (
  blocked: boolean,
  reasons: readonly MovementSuppressionReason[],
) => void;

export class InputBlocker {
  private readonly reasonsByToken = new Map<
    BlockToken,
    MovementSuppressionReason
  >();
  private readonly listeners: BlockListener[] = [];

  public acquire(reason: MovementSuppressionReason): () => void {
    const token = Symbol(reason);
    this.reasonsByToken.set(token, reason);
    this.emit();
    return () => {
      if (!this.reasonsByToken.delete(token)) {
        return;
      }
      this.emit();
    };
  }

  public onChange(listener: BlockListener): void {
    this.listeners.push(listener);
  }

  public isBlocked(): boolean {
    return this.reasonsByToken.size > 0;
  }

  public getReasons(): readonly MovementSuppressionReason[] {
    return [...new Set(this.reasonsByToken.values())];
  }

  public clear(): void {
    if (this.reasonsByToken.size === 0) {
      return;
    }
    this.reasonsByToken.clear();
    this.emit();
  }

  private emit(): void {
    const reasons = this.getReasons();
    const blocked = reasons.length > 0;
    for (const listener of this.listeners) {
      listener(blocked, reasons);
    }
  }
}
