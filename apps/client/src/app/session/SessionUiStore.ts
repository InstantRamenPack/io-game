export type SessionUiMode = "menu" | "connecting" | "playing" | "dead";

export type SessionUiState = {
  mode: SessionUiMode;
};

type SessionUiListener = (state: SessionUiState) => void;

export class SessionUiStore {
  private state: SessionUiState = {
    mode: "menu",
  };
  private readonly listeners: SessionUiListener[] = [];

  public getState(): SessionUiState {
    return this.state;
  }

  public setMode(mode: SessionUiMode): void {
    if (this.state.mode === mode) {
      return;
    }

    this.state = {
      ...this.state,
      mode,
    };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  public onChange(listener: SessionUiListener): void {
    this.listeners.push(listener);
  }
}
