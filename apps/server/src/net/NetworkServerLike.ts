export type OpenHandler = (clientId: string) => void;
export type MessageHandler = (
  clientId: string,
  rawMessage: string | Uint8Array,
) => void;
export type CloseHandler = (clientId: string) => void;

export interface NetworkServerLike {
  onOpen(handler: OpenHandler): void;
  onMessage(handler: MessageHandler): void;
  onClose(handler: CloseHandler): void;
  send(clientId: string, data: string | Uint8Array): void;
  broadcast(data: string | Uint8Array): void;
  disconnect(clientId: string, reason?: string): void;
}
