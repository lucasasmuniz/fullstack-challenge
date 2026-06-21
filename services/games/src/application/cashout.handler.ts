import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Result, type DomainError } from "@crash-game/domain-kit";
import { multiplierAt } from "@crash-game/curve";
import { IntegrationEventType } from "@crash-game/contracts";
import { RealtimeEvent } from "@crash-game/realtime-contracts";
import { ENV } from "@crash-game/nestjs-kit";
import {
  Bet,
  BetNotCashableError,
  NoBetToCashoutError,
  RoundNotRunningError,
} from "../domain";
import type { GamesEnv } from "../infrastructure/config/env.schema";
import {
  ROUND_REPOSITORY,
  type RoundRepository,
} from "./round.repository";
import {
  BET_REPOSITORY,
  BetConcurrencyError,
  type BetRepository,
  type OutboxMessage,
} from "./bet.repository";
import { REALTIME_PUBLISHER, type RealtimePublisher } from "./realtime.port";
import { betUpdatedFromBet } from "./realtime-events";

/**
 * Saque manual (server-authoritative — ADR 0014). Ordem **fail-fast**: lê o `Round` e, se
 * não estiver `RUNNING`, devolve 409 **sem nem carregar a aposta** (economiza I/O na corrida
 * cashout-vs-crash). O multiplicador é derivado do **relógio do servidor** (`multiplierAt`),
 * nunca do payload; o `crashPointX100` vem do `Round` (autoridade). `Bet.cashout` rejeita
 * `mult > crashPoint` — então mesmo lendo o status um ms antes do crash, a casa não é lesada.
 *
 * Anti dupla-liquidação: `Bet.cashout` só sai de `CONFIRMED` (1ª linha) e `saveWithOutbox`
 * faz fencing por `version` (2ª linha) → 2º clique / corrida → erro, nunca 2º pagamento.
 */
@Injectable()
export class CashoutHandler {
  constructor(
    @Inject(ROUND_REPOSITORY) private readonly rounds: RoundRepository,
    @Inject(BET_REPOSITORY) private readonly bets: BetRepository,
    @Inject(ENV) private readonly env: GamesEnv,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  async execute(playerId: string): Promise<Result<Bet, DomainError>> {
    const round = await this.rounds.findCurrent();
    if (!round || !round.canCashout() || !round.startedAt) {
      return Result.fail(new RoundNotRunningError());
    }

    const bet = await this.bets.findByPlayerAndRound(playerId, round.id);
    if (!bet) {
      return Result.fail(new NoBetToCashoutError());
    }

    const now = new Date();
    const multiplierX100 = multiplierAt(
      now.getTime() - round.startedAt.getTime(),
      this.env.CRASH_GROWTH_RATE,
    );

    const res = bet.cashout(multiplierX100, round.crashPointX100, now);
    if (res.isFail) {
      return Result.fail(res.unwrapError());
    }

    // Invariante: um cashout bem-sucedido sempre define o payout (≥ a aposta). Falha aqui é
    // regressão de domínio, não regra de negócio → throw (não um crédito de 0 mascarado).
    const payout = bet.payout;
    if (!payout) {
      throw new Error(`Payout ausente após cashout bem-sucedido (bet ${bet.id}).`);
    }

    const outbox: OutboxMessage = {
      id: randomUUID(),
      type: IntegrationEventType.CreditFunds,
      payload: {
        betId: bet.id,
        playerId,
        amountCents: Number(payout.toCents()),
        reason: "cashout",
      },
    };

    try {
      await this.bets.saveWithOutbox(bet, outbox);
    } catch (err) {
      if (err instanceof BetConcurrencyError) {
        // Cashout concorrente venceu a corrida → tratado como saque redundante (409).
        return Result.fail(new BetNotCashableError());
      }
      throw err;
    }
    // WS pós-commit (Risco 5): saque confirmado (CASHED_OUT) — agregado em mãos, com username.
    this.realtime.emitToPublic(
      RealtimeEvent.BetUpdated,
      betUpdatedFromBet(bet),
    );
    return Result.ok(bet);
  }
}
