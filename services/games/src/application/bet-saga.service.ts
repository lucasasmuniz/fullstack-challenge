import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  IntegrationEventType,
  type IntegrationMessage,
} from "@crash-game/contracts";
import { RoundStatus, type Bet } from "../domain";
import {
  ROUND_REPOSITORY,
  type RoundRepository,
} from "./round.repository";
import {
  BET_REPOSITORY,
  type BetRepository,
  type OutboxMessage,
} from "./bet.repository";

/**
 * Reações da saga aos eventos da Wallet (consumidos do `game-inbox`). `applyFromMessage`
 * faz inbox-dedup + transição + persistência fenced numa tx (exactly-once); transições
 * rejeitadas pela máquina de estados viram `no_op` (ack idempotente).
 *
 * **Débito (`FundsDebited`)**: se a rodada da aposta **já terminou** (late-debit — a aposta
 * nunca jogou), compensa com `refund` + `CreditFunds{reason=refund}`; senão `confirm`.
 * **Rejeição (`FundsDebitRejected`)**: `reject`. **Crédito (`FundsCredited`)**: ack (a aposta
 * já está terminal — `CASHED_OUT`/`REFUNDED`; o crédito é informativo).
 */
@Injectable()
export class BetSagaService {
  private readonly logger = new Logger(BetSagaService.name);

  constructor(
    @Inject(BET_REPOSITORY) private readonly bets: BetRepository,
    @Inject(ROUND_REPOSITORY) private readonly rounds: RoundRepository,
  ) {}

  async onFundsDebited(
    msg: IntegrationMessage<"FundsDebited">,
  ): Promise<void> {
    const { betId, roundId } = msg.payload;

    // Decide confirm vs refund pelo estado da rodada (late-debit → rodada terminal → refund).
    // O `roundId` vem na mensagem (eco do comando), então lemos só o `Round` — sem reler a
    // aposta (ela é recarregada dentro do `applyFromMessage`). Janela de corrida (rodada
    // transiciona entre a leitura e a aplicação) é sub-ms; no late-debit real (backlog SQS) a
    // rodada está firmemente terminal.
    const round = await this.rounds.findById(roundId);
    const terminal =
      round !== null &&
      (round.status === RoundStatus.CRASHED ||
        round.status === RoundStatus.SETTLED);

    if (terminal) {
      const outcome = await this.bets.applyFromMessage(
        msg.messageId,
        msg.type,
        betId,
        (b) => b.refund(new Date()),
        (b) => this.creditRefund(b),
      );
      this.logger.log(
        `Late-debit da aposta ${betId} → refund (rodada terminal): ${outcome}.`,
      );
      return;
    }

    const outcome = await this.bets.applyFromMessage(
      msg.messageId,
      msg.type,
      betId,
      (b) => b.confirm(new Date()),
    );
    this.logger.debug(`FundsDebited aplicado à aposta ${betId}: ${outcome}.`);
  }

  async onFundsDebitRejected(
    msg: IntegrationMessage<"FundsDebitRejected">,
  ): Promise<void> {
    const outcome = await this.bets.applyFromMessage(
      msg.messageId,
      msg.type,
      msg.payload.betId,
      (b) => b.reject(msg.payload.reason, new Date()),
    );
    this.logger.debug(
      `FundsDebitRejected aplicado à aposta ${msg.payload.betId}: ${outcome}.`,
    );
  }

  onFundsCredited(msg: IntegrationMessage<"FundsCredited">): Promise<void> {
    // A aposta já está terminal (CASHED_OUT/REFUNDED) — o crédito é a confirmação da Wallet.
    // Nada a transicionar; ack idempotente.
    this.logger.log(
      `FundsCredited confirmado (bet ${msg.payload.betId}, reason=${msg.payload.reason}).`,
    );
    return Promise.resolve();
  }

  /** Constrói o `CreditFunds{reason=refund}` a partir da aposta restituída (na mesma tx). */
  private creditRefund(bet: Bet): OutboxMessage {
    return {
      id: randomUUID(),
      type: IntegrationEventType.CreditFunds,
      payload: {
        betId: bet.id,
        playerId: bet.playerId,
        amountCents: Number(bet.amount.toCents()),
        reason: "refund",
      },
    };
  }
}
