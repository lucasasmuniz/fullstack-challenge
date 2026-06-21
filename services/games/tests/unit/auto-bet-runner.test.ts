import { describe, it, expect } from "bun:test";
import { Money } from "@crash-game/money";
import { Bet } from "../../src/domain/bet";
import { AutoBetSession } from "../../src/domain/auto-bet-session";
import { AutoBetStatus } from "../../src/domain/auto-bet-status";
import {
  AutoBetCompletionReason,
  AutoBetStrategy,
} from "../../src/domain/auto-bet-types";
import { DEFAULT_BET_LIMITS } from "../../src/domain/bet-limits";
import { AutoBetRunner } from "../../src/application/auto-bet-runner";
import type { AutoBetRepository } from "../../src/application/auto-bet.repository";
import type { BetRepository } from "../../src/application/bet.repository";
import type { PlaceBetHandler } from "../../src/application/place-bet.handler";

const NOW = new Date("2026-06-21T12:00:00.000Z");
const ROUND = "round-1";

const env = { BET_MIN_CENTS: 100, BET_MAX_CENTS: 100000 } as never;

function activeSession(): AutoBetSession {
  return AutoBetSession.start(
    {
      sessionId: "s-1",
      playerId: "player-1",
      username: "player",
      strategy: AutoBetStrategy.MARTINGALE,
      baseAmount: Money.fromCents(100),
      autoCashoutTargetX100: 200,
      stopLoss: Money.fromCents(100000),
      budget: Money.fromCents(100000),
      stopWin: null,
      maxRounds: null,
    },
    DEFAULT_BET_LIMITS,
    NOW,
  ).unwrap();
}

function betInStatus(
  kind: "cashed" | "lost" | "rejected" | "pending" | "confirmed",
): Bet {
  const bet = Bet.place(
    {
      betId: "bet-1",
      roundId: ROUND,
      playerId: "player-1",
      username: "player",
      amount: Money.fromCents(100),
    },
    DEFAULT_BET_LIMITS,
    NOW,
  ).unwrap();
  if (kind === "pending") return bet;
  if (kind === "rejected") {
    bet.reject("insufficient", NOW);
    return bet;
  }
  bet.confirm(NOW);
  if (kind === "confirmed") return bet; // anomalia: ainda CONFIRMED no reconcile
  if (kind === "cashed") bet.cashout(200, 500, NOW); // payout 200
  else bet.markLost(NOW);
  return bet;
}

class FakeAutoBetRepo implements AutoBetRepository {
  readonly saved: AutoBetSession[] = [];
  constructor(private readonly sessions: AutoBetSession[]) {}
  insert(): Promise<void> {
    return Promise.resolve();
  }
  save(session: AutoBetSession): Promise<void> {
    this.saved.push(session);
    return Promise.resolve();
  }
  findActive(): Promise<AutoBetSession[]> {
    return Promise.resolve(this.sessions);
  }
  findActiveByPlayer(): Promise<AutoBetSession | null> {
    return Promise.resolve(null);
  }
  findLatestByPlayer(): Promise<AutoBetSession | null> {
    return Promise.resolve(null);
  }
}

function fakeBets(bet: Bet | null): BetRepository {
  return {
    findById: () => Promise.resolve(bet),
  } as unknown as BetRepository;
}

function runnerFor(
  session: AutoBetSession,
  bet: Bet | null,
): { runner: AutoBetRunner; repo: FakeAutoBetRepo } {
  const repo = new FakeAutoBetRepo([session]);
  const place = {} as unknown as PlaceBetHandler;
  const runner = new AutoBetRunner(repo, fakeBets(bet), place, env);
  return { runner, repo };
}

describe("AutoBetRunner.reconcile (mapeamento bet → outcome)", () => {
  it("bet CASHED_OUT → WIN (lucro = payout - aposta)", async () => {
    const s = activeSession();
    s.commitPlaced(ROUND, "bet-1", NOW);
    const { runner } = runnerFor(s, betInStatus("cashed"));
    await runner.reconcile(ROUND);
    expect(s.netResultCents).toBe(100n); // 200 - 100
    expect(s.roundsPlayed).toBe(1);
    expect(s.nextAmount.toCents()).toBe(100n); // reset
  });

  it("bet LOST → LOSS (Martingale dobra)", async () => {
    const s = activeSession();
    s.commitPlaced(ROUND, "bet-1", NOW);
    const { runner } = runnerFor(s, betInStatus("lost"));
    await runner.reconcile(ROUND);
    expect(s.netResultCents).toBe(-100n);
    expect(s.nextAmount.toCents()).toBe(200n);
  });

  it("bet REJECTED → encerra (INSUFFICIENT_FUNDS)", async () => {
    const s = activeSession();
    s.commitPlaced(ROUND, "bet-1", NOW);
    const { runner } = runnerFor(s, betInStatus("rejected"));
    await runner.reconcile(ROUND);
    expect(s.status).toBe(AutoBetStatus.COMPLETED);
    expect(s.completionReason).toBe(AutoBetCompletionReason.INSUFFICIENT_FUNDS);
  });

  it("bet PENDING (débito não confirmou antes do crash) → SKIPPED (não pune)", async () => {
    const s = activeSession();
    s.commitPlaced(ROUND, "bet-1", NOW);
    const { runner } = runnerFor(s, betInStatus("pending"));
    await runner.reconcile(ROUND);
    expect(s.roundsPlayed).toBe(0);
    expect(s.nextAmount.toCents()).toBe(100n); // não dobrou
    expect(s.status).toBe(AutoBetStatus.ACTIVE);
  });

  it("bet ainda CONFIRMED no reconcile (anomalia) → SKIPPED conservador, sem punir", async () => {
    const s = activeSession();
    s.commitPlaced(ROUND, "bet-1", NOW);
    const { runner } = runnerFor(s, betInStatus("confirmed"));
    await runner.reconcile(ROUND);
    expect(s.roundsPlayed).toBe(0);
    expect(s.nextAmount.toCents()).toBe(100n);
    expect(s.status).toBe(AutoBetStatus.ACTIVE);
  });

  it("sessão que não apostou neste round → não reconcilia", async () => {
    const s = activeSession(); // currentRoundId = null
    const { runner, repo } = runnerFor(s, null);
    await runner.reconcile(ROUND);
    expect(repo.saved).toHaveLength(0);
  });
});
