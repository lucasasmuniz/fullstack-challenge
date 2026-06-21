import type { BalanceUpdatedPayload } from "@crash-game/realtime-contracts";

/**
 * Port de emissão WS da Wallet (server→client). A Wallet é dona do saldo, então ela empurra
 * `balance:updated` para a sala **privada** do jogador (`user:{sub}`) após cada mudança de saldo
 * — chamado **estritamente após o commit** (Risco 5). O gateway (estrito: exige token) é o adapter.
 */
export interface RealtimePublisher {
  emitBalance(playerId: string, payload: BalanceUpdatedPayload): void;
}

export const REALTIME_PUBLISHER = Symbol("REALTIME_PUBLISHER");
