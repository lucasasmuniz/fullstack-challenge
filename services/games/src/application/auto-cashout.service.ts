import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { IntegrationEventType } from "@crash-game/contracts";
import { RealtimeEvent } from "@crash-game/realtime-contracts";
import {
  BET_REPOSITORY,
  BetConcurrencyError,
  type BetRepository,
  type OutboxMessage,
} from "./bet.repository";
import { REALTIME_PUBLISHER, type RealtimePublisher } from "./realtime.port";
import { betUpdatedFromBet } from "./realtime-events";
import { GameMetrics } from "../infrastructure/observability/game-metrics";

/**
 * Auto-cashout — saque automático server-authoritative. Roda **dentro do tick loop do
 * líder** (`RoundScheduler`, leader-only): a cada tick, com o multiplicador autoritativo do
 * servidor, saca as apostas `CONFIRMED` cujo `autoCashoutTargetX100` já foi atingido.
 *
 * Decisões:
 * - **Saque no ALVO, não no tick:** o payout é `amount × autoCashoutTargetX100` (determinístico,
 *   imune ao jitter do tick). Como a rodada está `RUNNING`, `target ≤ multiplicadorAtual < crashPoint`
 *   ⇒ `Bet.cashout` (que exige `mult ≤ crashPoint`) sempre aceita.
 * - **Reusa o caminho de dinheiro do cashout manual:** `Bet.cashout` + `saveWithOutbox` (fencing por
 *   `version` + outbox `CreditFunds` na mesma tx). Nenhuma rota nova de dinheiro.
 * - **Anti dupla-liquidação:** se um cashout manual venceu a corrida, `saveWithOutbox` lança
 *   `BetConcurrencyError` (version) → a aposta é pulada, nunca há 2º crédito.
 * - **Re-entrância:** um flag evita varreduras sobrepostas (ticks rápidos + I/O); a correção real
 *   continua sendo a máquina de estados + fencing.
 */
@Injectable()
export class AutoCashoutService {
  private readonly logger = new Logger(AutoCashoutService.name);
  private sweeping = false;

  constructor(
    @Inject(BET_REPOSITORY) private readonly bets: BetRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly metrics: GameMetrics,
  ) {}

  /**
   * Saca as apostas com alvo atingido na rodada. Retorna quantas foram sacadas. Idempotente
   * sob ticks repetidos (apostas já sacadas saem de `CONFIRMED` e não reaparecem).
   */
  async sweep(
    roundId: string,
    crashPointX100: number,
    currentMultiplierX100: number,
    now: Date,
  ): Promise<number> {
    if (this.sweeping) {
      return 0;
    }
    this.sweeping = true;
    try {
      const candidates = await this.bets.findAutoCashoutCandidates(
        roundId,
        currentMultiplierX100,
      );
      let cashed = 0;
      for (const bet of candidates) {
        const target = bet.autoCashoutTargetX100;
        if (target === null) {
          continue;
        }
        const res = bet.cashout(target, crashPointX100, now);
        if (res.isFail) {
          continue;
        }
        const payout = bet.payout;
        if (!payout) {
          this.logger.error(`Payout ausente após auto-cashout (bet ${bet.id}) — pulando.`);
          continue;
        }
        const outbox: OutboxMessage = {
          id: randomUUID(),
          type: IntegrationEventType.CreditFunds,
          payload: {
            betId: bet.id,
            playerId: bet.playerId,
            amountCents: Number(payout.toCents()),
            reason: "cashout",
          },
        };
        try {
          await this.bets.saveWithOutbox(bet, outbox);
        } catch (err) {
          if (err instanceof BetConcurrencyError) {
            continue;
          }
          throw err;
        }
        this.realtime.emitToPublic(RealtimeEvent.BetUpdated, betUpdatedFromBet(bet));
        this.metrics.recordPayout(payout.toCents());
        cashed++;
      }
      if (cashed > 0) {
        this.logger.log(
          `Auto-cashout: ${cashed.toString()} aposta(s) sacada(s) na rodada ${roundId}.`,
        );
      }
      return cashed;
    } finally {
      this.sweeping = false;
    }
  }
}
