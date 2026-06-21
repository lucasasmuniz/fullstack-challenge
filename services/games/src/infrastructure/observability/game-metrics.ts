import { Injectable } from "@nestjs/common";
import {
  metrics,
  type Counter,
  type Histogram,
} from "@crash-game/observability";

/**
 * `GameMetrics` — instrumentos OTel do Game. A app exporta **só contadores monótonos puros
 * e histogramas**; o **RTP** é derivado em PromQL no Grafana
 * (`sum(increase(crash_game_payouts_total)) / sum(increase(crash_game_wagers_total))`) — exportar
 * a razão como gauge destruiria a agregação entre instâncias (média de médias ≠ média do todo).
 *
 * Se o `MeterProvider` global não foi setado (testes/`OTEL_ENABLED=false`), `getMeter` devolve um
 * meter **no-op** — os `add`/`record` viram no-ops baratos. Por isso é seguro instanciar sempre.
 */
@Injectable()
export class GameMetrics {
  private readonly bets: Counter;
  private readonly wagers: Counter;
  private readonly payouts: Counter;
  private readonly rounds: Counter;
  private readonly crashPoint: Histogram;
  private readonly wsEmit: Histogram;

  constructor() {
    const meter = metrics.getMeter("crash-game-games");
    this.bets = meter.createCounter("crash_game_bets", {
      description: "Total de apostas colocadas.",
    });
    this.wagers = meter.createCounter("crash_game_wagers_cents", {
      description: "Volume apostado (centavos).",
    });
    this.payouts = meter.createCounter("crash_game_payouts_cents", {
      description: "Volume pago em cashout (centavos).",
    });
    this.rounds = meter.createCounter("crash_game_rounds", {
      description: "Total de rodadas crashadas.",
    });
    this.crashPoint = meter.createHistogram("crash_game_crash_point_x100", {
      description: "Distribuição do crash point (×100).",
    });
    this.wsEmit = meter.createHistogram("crash_game_ws_emit_ms", {
      description: "Duração da emissão de eventos WebSocket (ms).",
    });
  }

  recordBetPlaced(): void {
    this.bets.add(1);
  }

  /** Volume apostado (na colocação — rejeições são raras; RTP é métrica de monitoração). */
  recordWager(cents: bigint): void {
    this.wagers.add(Number(cents));
  }

  recordPayout(cents: bigint): void {
    this.payouts.add(Number(cents));
  }

  recordRound(crashPointX100: number): void {
    this.rounds.add(1);
    this.crashPoint.record(crashPointX100);
  }

  recordWsEmit(durationMs: number): void {
    this.wsEmit.record(durationMs);
  }
}
