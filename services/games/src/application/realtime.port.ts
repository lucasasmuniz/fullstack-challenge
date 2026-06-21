import type {
  RealtimeEvent,
  RealtimeEventPayloads,
} from "@crash-game/realtime-contracts";

/**
 * Port de emissão de eventos em tempo real (server→client). A aplicação depende desta
 * interface; o adapter é o gateway socket.io (infraestrutura) — mesma separação hexagonal
 * dos consumers/relay. As app services chamam isto **estritamente após o commit** da
 * transação que fundamenta o evento (Risco 5 — nunca dentro de `em.transactional`).
 *
 * No Game só há emissão **pública** (rodada/aposta) — anônimo assiste. Saldo (privado) é
 * empurrado pela Wallet.
 */
export interface RealtimePublisher {
  emitToPublic<E extends RealtimeEvent>(
    event: E,
    payload: RealtimeEventPayloads[E],
  ): void;
}

export const REALTIME_PUBLISHER = Symbol("REALTIME_PUBLISHER");
