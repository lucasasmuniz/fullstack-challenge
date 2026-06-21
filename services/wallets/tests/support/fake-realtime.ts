import type { BalanceUpdatedPayload } from "@crash-game/realtime-contracts";
import type { RealtimePublisher } from "../../src/application/realtime.port";

/** Fake do publisher WS: captura os pushes de saldo por jogador (para asserções de teste). */
export class FakeRealtimePublisher implements RealtimePublisher {
  readonly emitted: { playerId: string; payload: BalanceUpdatedPayload }[] = [];

  emitBalance(playerId: string, payload: BalanceUpdatedPayload): void {
    this.emitted.push({ playerId, payload });
  }
}
