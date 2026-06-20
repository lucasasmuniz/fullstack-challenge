import type { Result, DomainError } from "@crash-game/domain-kit";
import type { IntegrationEventType } from "@crash-game/contracts";
import type { Bet } from "../domain";

/**
 * Conflito de concorrência ao salvar a aposta (a `version` no banco não bate). 2ª linha de
 * defesa anti dupla-liquidação (a 1ª é a máquina de estados). Não é erro de HTTP: na saga,
 * uma reentrega SQS concorrente cai aqui, a tx faz rollback e a mensagem é reprocessada.
 */
export class BetConcurrencyError extends Error {
  constructor(betId: string) {
    super(`Conflito de concorrência ao salvar a aposta ${betId} (version desatualizada).`);
    this.name = "BetConcurrencyError";
  }
}

/** Mensagem a gravar na outbox na MESMA tx do estado da aposta (`id` = `messageId`). */
export interface OutboxMessage {
  readonly id: string;
  readonly type: IntegrationEventType;
  readonly payload: unknown;
}

/** Transição de domínio aplicada a uma aposta carregada (confirm/reject/refund/cashout). */
export type BetMutation = (bet: Bet) => Result<void, DomainError>;

/** Constrói a mensagem de outbox a gravar na mesma tx, a partir da aposta já transicionada. */
export type OutboxBuilder = (bet: Bet) => OutboxMessage;

/** Desfecho da aplicação de uma mensagem da saga a uma aposta. */
export type BetMessageOutcome =
  | "applied" // transição aplicada e persistida
  | "duplicate" // messageId já processado (inbox) — ack seco
  | "not_found" // aposta inexistente — ack seco (não trava a fila)
  | "no_op"; // transição rejeitada pela máquina de estados (redundante) — ack seco

/**
 * Port do repositório da `Bet` (state-stored) + operações transacionais da saga.
 *
 * - `place`: insere a aposta + a linha da outbox (`DebitFunds`) na **mesma tx**.
 * - `applyFromMessage`: registra o `messageId` na inbox (dedup), carrega a aposta, aplica a
 *   transição de domínio e persiste com **fencing por `version`** — tudo na mesma tx
 *   (exactly-once). `mutate` falhar (estado terminal) = `no_op` (ack idempotente).
 */
export interface BetRepository {
  place(bet: Bet, outbox: OutboxMessage): Promise<void>;
  /**
   * Inbox dedup + transição + persistência fenced por `version`, na mesma tx. Se
   * `buildOutbox` for passado e a transição aplicar, grava a outbox na mesma tx (ex.:
   * refund → `CreditFunds`). `mutate` falhar (estado terminal) = `no_op` (ack idempotente).
   */
  applyFromMessage(
    messageId: string,
    messageType: string,
    betId: string,
    mutate: BetMutation,
    buildOutbox?: OutboxBuilder,
  ): Promise<BetMessageOutcome>;
  /**
   * Persiste uma transição iniciada via REST (cashout) com **fencing por `version`** +
   * grava a outbox (`CreditFunds`) na mesma tx. Conflito de version → `BetConcurrencyError`
   * (cashout concorrente). A aposta já deve ter a transição aplicada em memória.
   */
  saveWithOutbox(bet: Bet, outbox: OutboxMessage): Promise<void>;
  /**
   * Liquidação do crash (líder-inline, ADR 0018): **bulk UPDATE** das apostas `CONFIRMED`
   * da rodada para `LOST` (sem hidratar agregado, sem mover dinheiro). Idempotente
   * (re-settle = 0 linhas). Retorna quantas foram liquidadas.
   */
  markRoundLost(roundId: string): Promise<number>;
  findById(betId: string): Promise<Bet | null>;
  findByPlayerAndRound(playerId: string, roundId: string): Promise<Bet | null>;
}

export const BET_REPOSITORY = Symbol("BET_REPOSITORY");
