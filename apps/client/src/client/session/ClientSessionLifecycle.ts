import { ClientWorldState } from "@client/net/ClientWorldState.ts";

export class ClientSessionLifecycle {
  private started = false;
  private sessionReady = false;

  public begin(): boolean {
    if (this.started) {
      return false;
    }

    this.started = true;
    this.sessionReady = false;
    return true;
  }

  public markSessionReady(): void {
    this.sessionReady = true;
  }

  public reset(): void {
    this.started = false;
    this.sessionReady = false;
  }

  public isStarted(): boolean {
    return this.started;
  }

  public isSessionReady(): boolean {
    return this.sessionReady;
  }

  public createWorldState(snapshotHistoryLimit: number): ClientWorldState {
    return new ClientWorldState(snapshotHistoryLimit);
  }
}
