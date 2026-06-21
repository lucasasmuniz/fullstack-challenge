import { describe, it, expect } from "bun:test";
import { Money } from "@crash-game/money";
import { IntegrationEventType } from "@crash-game/contracts";
import { RealtimeEvent } from "@crash-game/realtime-contracts";
import { Bet } from "../../src/domain/bet";
import { BetStatus } from "../../src/domain/bet-status";
import { DEFAULT_BET_LIMITS } from "../../src/domain/bet-limits";
import { AutoCashoutService } from "../../src/application/auto-cashout.service";
import { GameMetrics } from "../../src/infrastructure/observability/game-metrics";
import {
  BetConcurrencyError,
  type BetRepository,
  type OutboxMessage,
} from "../../src/application/bet.repository";
import type { RealtimePublisher } from "../../src/application/realtime.port";

const NOW = new Date("2026-06-21T12:00:00.000Z");
const CRASH_X100 = 200; // 2,00x

function confirmedBet(target: number | null, amountCents = 1000): Bet {
  const bet = Bet.place(
    {
      betId: `bet-${Math.random().toString(36).slice(2)}`,
      roundId: "round-1",
      playerId: "player-1",
      username: "player",
      amount: Money.fromCents(amountCents),
      autoCashoutTargetX100: target,
    },
    DEFAULT_BET_LIMITS,
    NOW,
  ).unwrap();
  bet.confirm(NOW);
  bet.pullEvents();
  return bet;
}

class FakeBetRepo implements BetRepository {
  readonly saved: { bet: Bet; outbox: OutboxMessage }[] = [];

  constructor(
    private readonly candidates: Bet[],
    private readonly onSave: (bet: Bet) => void = () => {},
  ) {}

  findAutoCashoutCandidates(): Promise<Bet[]> {
    return Promise.resolve(this.candidates);
  }
  saveWithOutbox(bet: Bet, outbox: OutboxMessage): Promise<void> {
    this.onSave(bet);
    this.saved.push({ bet, outbox });
    return Promise.resolve();
  }
  place(): Promise<void> {
    throw new Error("unused");
  }
  applyFromMessage(): Promise<never> {
    throw new Error("unused");
  }
  markRoundLost(): Promise<number> {
    throw new Error("unused");
  }
  findById(): Promise<Bet | null> {
    return Promise.resolve(null);
  }
  findByPlayerAndRound(): Promise<Bet | null> {
    return Promise.resolve(null);
  }
}

class FakePublisher implements RealtimePublisher {
  readonly events: { event: RealtimeEvent; payload: unknown }[] = [];
  emitToPublic<E extends RealtimeEvent>(event: E, payload: unknown): void {
    this.events.push({ event, payload });
  }
}

describe("AutoCashoutService", () => {
  it("saca no ALVO (não no tick): payout = amount × target, outbox CreditFunds, emite bet:updated", async () => {
    const bet = confirmedBet(150, 1000); // alvo 1,50x, aposta 10,00
    const repo = new FakeBetRepo([bet]);
    const pub = new FakePublisher();
    const svc = new AutoCashoutService(repo, pub, new GameMetrics());

    // tick em 1,80x (já passou do alvo de 1,50x)
    const cashed = await svc.sweep("round-1", CRASH_X100, 180, NOW);

    expect(cashed).toBe(1);
    expect(bet.status).toBe(BetStatus.CASHED_OUT);
    expect(bet.cashoutMultiplierX100).toBe(150); // sacou no ALVO, não em 180
    expect(repo.saved).toHaveLength(1);
    const { outbox } = repo.saved[0];
    expect(outbox.type).toBe(IntegrationEventType.CreditFunds);
    // payout = floor(1000 × 150 / 100) = 1500
    expect((outbox.payload as { amountCents: number }).amountCents).toBe(1500);
    expect((outbox.payload as { reason: string }).reason).toBe("cashout");
    expect(pub.events).toHaveLength(1);
    expect(pub.events[0].event).toBe(RealtimeEvent.BetUpdated);
  });

  it("corrida perdida (BetConcurrencyError no save) → pula, sem 2º crédito nem emit", async () => {
    const bet = confirmedBet(150);
    const repo = new FakeBetRepo([bet], () => {
      throw new BetConcurrencyError(bet.id);
    });
    const pub = new FakePublisher();
    const svc = new AutoCashoutService(repo, pub, new GameMetrics());

    const cashed = await svc.sweep("round-1", CRASH_X100, 180, NOW);

    expect(cashed).toBe(0);
    expect(pub.events).toHaveLength(0);
  });

  it("sem candidatos → no-op", async () => {
    const repo = new FakeBetRepo([]);
    const pub = new FakePublisher();
    const svc = new AutoCashoutService(repo, pub, new GameMetrics());

    expect(await svc.sweep("round-1", CRASH_X100, 180, NOW)).toBe(0);
    expect(repo.saved).toHaveLength(0);
  });

  it("guard de re-entrância: varredura sobreposta retorna 0 sem reprocessar", async () => {
    const bet = confirmedBet(150);
    const repo = new FakeBetRepo([bet]);
    const pub = new FakePublisher();
    const svc = new AutoCashoutService(repo, pub, new GameMetrics());

    // dispara duas varreduras sem await da 1ª: a 2ª vê sweeping=true e sai com 0.
    const p1 = svc.sweep("round-1", CRASH_X100, 180, NOW);
    const p2 = svc.sweep("round-1", CRASH_X100, 180, NOW);
    const [c1, c2] = await Promise.all([p1, p2]);

    expect(c1).toBe(1);
    expect(c2).toBe(0);
    expect(repo.saved).toHaveLength(1); // processada uma única vez
  });
});
