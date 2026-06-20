import type { Wallet } from "../domain/wallet";
import type { WalletReason } from "../domain/wallet-reason";
import type { WalletView } from "./wallet.view";

/** Mensagem a publicar (resposta da saga) gravada na MESMA tx do append do ledger. */
export interface OutboxMessage {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
}

/** Referência da mensagem recebida, para dedup na inbox (idempotência exactly-once). */
export interface InboxRef {
  readonly messageId: string;
  readonly type: string;
}

/**
 * Port do repositório da Wallet (hexagonal). A aplicação depende desta interface;
 * o adapter MikroORM (infrastructure) a implementa. O carregamento reconstrói o
 * agregado pelo `fold` dos eventos; o `save` persiste os novos eventos + projeção
 * na mesma transação.
 */
export interface WalletRepository {
  /** Carrega e reconstrói o agregado (fold dos eventos) — lado de escrita. */
  findByPlayerId(playerId: string): Promise<Wallet | null>;
  /** Lê a projeção de saldo — lado de leitura (CQRS). */
  findViewByPlayerId(playerId: string): Promise<WalletView | null>;
  save(wallet: Wallet): Promise<void>;
  /**
   * Idempotência REST **escopada por carteira**: devolve o valor do movimento já
   * aplicado para este (walletId, reason, correlationId), ou `null` se nunca foi
   * processado. Escopar por `walletId` evita que a key de um jogador interfira na de
   * outro; devolver o `amountCents` permite detectar reuso de key com payload
   * diferente (Idempotency-Key conflict).
   */
  findProcessedMovement(
    walletId: string,
    reason: WalletReason,
    correlationId: string,
  ): Promise<{ amountCents: bigint } | null>;

  /**
   * Escrita atômica da saga: **na mesma transação** registra a `inbox` (dedup), faz append
   * dos eventos pendentes do agregado + atualiza a projeção (se houver eventos) e grava a
   * `outbox` da resposta. Conflito de `inbox` (PK), `version` ou `(reason, correlation_id)`
   * estoura `UniqueConstraintViolationException` — o serviço desambígua e decide retry/dedup.
   * `wallet = null` (carteira inexistente) ou zero eventos (débito recusado) escrevem só
   * inbox + outbox, sem tocar o ledger.
   */
  appendSagaResult(
    wallet: Wallet | null,
    outbox: OutboxMessage,
    inbox: InboxRef,
  ): Promise<void>;

  /** A mensagem já foi processada (existe na inbox)? Usado para desambiguar conflitos. */
  wasMessageProcessed(messageId: string): Promise<boolean>;
}

/** Token DI para injetar a implementação do {@link WalletRepository}. */
export const WALLET_REPOSITORY = Symbol("WALLET_REPOSITORY");
