import { Injectable } from "@nestjs/common";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { EntityManager } from "@mikro-orm/postgresql";
import { Money } from "@crash-game/money";
import { Bet, BetStatus, BetAlreadyExistsError } from "../../domain";
import {
  BetConcurrencyError,
  type BetMessageOutcome,
  type BetMutation,
  type BetRepository,
  type OutboxBuilder,
  type OutboxMessage,
} from "../../application/bet.repository";
import { BetEntity } from "./bet.entity";
import { InboxEntity } from "./inbox.entity";
import { OutboxEntity } from "./outbox.entity";

/**
 * Adapter MikroORM da `Bet` + operações transacionais da saga.
 *
 * - `place`: insere a aposta + a linha da outbox na MESMA tx (atômico). `UNIQUE(round_id,
 *   player_id)` → `BetAlreadyExistsError` (aposta dupla).
 * - `applyFromMessage`: inbox dedup + carga + transição + `nativeUpdate` fenced por
 *   `version`, tudo numa tx → exactly-once. Conflito de version → `BetConcurrencyError`
 *   (rollback → reprocessa). Estado terminal → `no_op` (ack idempotente).
 */
@Injectable()
export class MikroOrmBetRepository implements BetRepository {
  constructor(private readonly em: EntityManager) {}

  async place(bet: Bet, outbox: OutboxMessage): Promise<void> {
    const now = new Date();
    try {
      await this.em.transactional((em) => {
        em.persist(
          em.create(BetEntity, {
            id: bet.id,
            roundId: bet.roundId,
            playerId: bet.playerId,
            username: bet.username,
            amountCents: bet.amount.toCents(),
            status: bet.status,
            autoCashoutTargetX100: bet.autoCashoutTargetX100,
            cashoutMultiplierX100: bet.cashoutMultiplierX100,
            payoutCents: bet.payout ? bet.payout.toCents() : null,
            version: bet.version,
            placedAt: bet.placedAt,
            confirmedAt: bet.confirmedAt,
            resolvedAt: bet.resolvedAt,
            createdAt: now,
          }),
        );
        em.persist(
          em.create(OutboxEntity, {
            id: outbox.id,
            type: outbox.type,
            payload: outbox.payload,
            status: "pending",
            attempts: 0,
            nextAttemptAt: now,
            createdAt: now,
            sentAt: null,
          }),
        );
        return Promise.resolve();
      });
    } catch (err) {
      if (err instanceof UniqueConstraintViolationException) {
        throw new BetAlreadyExistsError();
      }
      throw err;
    }
  }

  async applyFromMessage(
    messageId: string,
    messageType: string,
    betId: string,
    mutate: BetMutation,
    buildOutbox?: OutboxBuilder,
  ): Promise<BetMessageOutcome> {
    try {
      return await this.em.transactional(async (em) => {
        // Inbox dedup: insert direto; conflito = reentrega → propaga p/ ser tratado fora.
        await em.insert(InboxEntity, {
          messageId,
          type: messageType,
          processedAt: new Date(),
        });

        const row = await em.findOne(BetEntity, { id: betId });
        if (!row) {
          return "not_found"; // inbox registrada nesta tx → ack seco
        }

        const bet = toBet(row);
        const res = mutate(bet);
        if (res.isFail) {
          return "no_op"; // estado terminal/transição inválida = redundante → ack
        }

        const affected = await em.nativeUpdate(
          BetEntity,
          { id: betId, version: bet.version - 1 },
          updateFromBet(bet),
        );
        if (affected !== 1) {
          throw new BetConcurrencyError(betId);
        }

        if (buildOutbox) {
          em.persist(em.create(OutboxEntity, toOutboxRow(buildOutbox(bet))));
        }
        return "applied";
      });
    } catch (err) {
      if (err instanceof UniqueConstraintViolationException) {
        return "duplicate"; // o messageId já estava na inbox
      }
      throw err; // BetConcurrencyError / falha técnica → sem ack → retry
    }
  }

  async saveWithOutbox(bet: Bet, outbox: OutboxMessage): Promise<void> {
    await this.em.transactional(async (em) => {
      const affected = await em.nativeUpdate(
        BetEntity,
        { id: bet.id, version: bet.version - 1 },
        updateFromBet(bet),
      );
      if (affected !== 1) {
        throw new BetConcurrencyError(bet.id);
      }
      em.persist(em.create(OutboxEntity, toOutboxRow(outbox)));
    });
  }

  async markRoundLost(roundId: string): Promise<number> {
    // BULK UPDATE direto (ADR 0018): liquida CONFIRMED→LOST sem hidratar agregado nem mover
    // dinheiro. `WHERE status='CONFIRMED'` ignora naturalmente quem sacou na corrida
    // (CASHED_OUT) — sem OCC bloodbath. Idempotente (re-settle = 0 linhas).
    return this.em.fork().nativeUpdate(
      BetEntity,
      { roundId, status: BetStatus.CONFIRMED },
      { status: BetStatus.LOST, resolvedAt: new Date() },
    );
  }

  async findById(betId: string): Promise<Bet | null> {
    const row = await this.em.fork().findOne(BetEntity, { id: betId });
    return row ? toBet(row) : null;
  }

  async findByPlayerAndRound(
    playerId: string,
    roundId: string,
  ): Promise<Bet | null> {
    const row = await this.em.fork().findOne(BetEntity, { playerId, roundId });
    return row ? toBet(row) : null;
  }
}

/** Colunas mutáveis da aposta após uma transição (para o `nativeUpdate` fenced). */
function updateFromBet(bet: Bet): {
  status: string;
  version: number;
  cashoutMultiplierX100: number | null;
  payoutCents: bigint | null;
  confirmedAt: Date | null;
  resolvedAt: Date | null;
} {
  return {
    status: bet.status,
    version: bet.version,
    cashoutMultiplierX100: bet.cashoutMultiplierX100,
    payoutCents: bet.payout ? bet.payout.toCents() : null,
    confirmedAt: bet.confirmedAt,
    resolvedAt: bet.resolvedAt,
  };
}

/** Mensagem de saga → linha de outbox pendente. */
function toOutboxRow(outbox: OutboxMessage): {
  id: string;
  type: string;
  payload: unknown;
  status: string;
  attempts: number;
  nextAttemptAt: Date;
  createdAt: Date;
  sentAt: null;
} {
  const now = new Date();
  return {
    id: outbox.id,
    type: outbox.type,
    payload: outbox.payload,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    sentAt: null,
  };
}

function toBet(e: BetEntity): Bet {
  return Bet.reconstitute({
    betId: e.id,
    roundId: e.roundId,
    playerId: e.playerId,
    username: e.username,
    amount: Money.fromCents(e.amountCents),
    status: toBetStatus(e.status),
    autoCashoutTargetX100: e.autoCashoutTargetX100,
    cashoutMultiplierX100: e.cashoutMultiplierX100,
    payout: e.payoutCents !== null ? Money.fromCents(e.payoutCents) : null,
    version: e.version,
    placedAt: e.placedAt,
    confirmedAt: e.confirmedAt,
    resolvedAt: e.resolvedAt,
  });
}

/** Valida o status persistido (fail-closed). Exportado: reusado pelo adapter de query. */
export function toBetStatus(value: string): BetStatus {
  if ((Object.values(BetStatus) as string[]).includes(value)) {
    return value as BetStatus;
  }
  throw new Error(`Status de aposta inválido no banco: ${value}`);
}
