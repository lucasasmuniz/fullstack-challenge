import { Injectable } from "@nestjs/common";
import {
  metrics,
  type Counter,
} from "@crash-game/observability";

/**
 * `WalletMetrics` — instrumentos OTel da Wallet. Cobre os movimentos **intra-contexto**
 * (deposit/withdraw via REST); o volume de bet/cashout (cross-service) já é contado no Game
 * (`crash_game_wagers_total`/`payouts_total`), evitando double-count.
 *
 * Sem `MeterProvider` global (testes/`OTEL_ENABLED=false`) → meter no-op (records baratos).
 */
@Injectable()
export class WalletMetrics {
  private readonly movements: Counter;
  private readonly amount: Counter;

  constructor() {
    const meter = metrics.getMeter("crash-game-wallets");
    this.movements = meter.createCounter("wallet_movements", {
      description: "Movimentos do ledger por motivo (deposit/withdrawal).",
    });
    this.amount = meter.createCounter("wallet_movement_cents", {
      description: "Volume movimentado por motivo (centavos).",
    });
  }

  record(reason: string, cents: bigint): void {
    this.movements.add(1, { reason });
    this.amount.add(Number(cents), { reason });
  }
}
