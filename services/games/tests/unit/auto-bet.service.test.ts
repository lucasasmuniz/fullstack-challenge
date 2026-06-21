import { describe, it, expect } from "bun:test";
import { Money } from "@crash-game/money";
import { AutoBetSession } from "../../src/domain/auto-bet-session";
import { AutoBetStatus } from "../../src/domain/auto-bet-status";
import { AutoBetStrategy } from "../../src/domain/auto-bet-types";
import { DEFAULT_BET_LIMITS } from "../../src/domain/bet-limits";
import { AutoBetService } from "../../src/application/auto-bet.service";
import {
  AutoBetConcurrencyError,
  type AutoBetRepository,
} from "../../src/application/auto-bet.repository";

const env = { BET_MIN_CENTS: 100, BET_MAX_CENTS: 100000 } as never;

function activeSession(): AutoBetSession {
  return AutoBetSession.start(
    {
      sessionId: "s-1",
      playerId: "player-1",
      username: "player",
      strategy: AutoBetStrategy.FIXED,
      baseAmount: Money.fromCents(100),
      autoCashoutTargetX100: 150,
      stopLoss: Money.fromCents(1000),
      budget: Money.fromCents(10000),
      stopWin: null,
      maxRounds: null,
    },
    DEFAULT_BET_LIMITS,
    new Date(),
  ).unwrap();
}

/** Repo que falha o N-ésimo save com AutoBetConcurrencyError (simula corrida com o líder). */
class FlakyRepo implements AutoBetRepository {
  saves = 0;
  constructor(
    private session: AutoBetSession | null,
    private failFirstNSaves = 0,
  ) {}
  insert(): Promise<void> {
    return Promise.resolve();
  }
  save(s: AutoBetSession): Promise<void> {
    this.saves += 1;
    if (this.saves <= this.failFirstNSaves) {
      return Promise.reject(new AutoBetConcurrencyError(s.id));
    }
    this.session = s;
    return Promise.resolve();
  }
  findActive(): Promise<AutoBetSession[]> {
    return Promise.resolve(this.session ? [this.session] : []);
  }
  findActiveByPlayer(): Promise<AutoBetSession | null> {
    // Cada load devolve uma sessão ACTIVE fresca (como recarregar do banco).
    return Promise.resolve(
      this.session && this.session.status === AutoBetStatus.ACTIVE
        ? activeSession()
        : null,
    );
  }
  findLatestByPlayer(): Promise<AutoBetSession | null> {
    return Promise.resolve(this.session);
  }
}

describe("AutoBetService.stop", () => {
  it("para a sessão ativa (STOPPED/MANUAL)", async () => {
    const svc = new AutoBetService(new FlakyRepo(activeSession()), env);
    const res = await svc.stop("player-1");
    expect(res.isOk).toBe(true);
    expect(res.unwrap().status).toBe(AutoBetStatus.STOPPED);
  });

  it("sem sessão ativa → AutoBetNotActiveError", async () => {
    const svc = new AutoBetService(new FlakyRepo(null), env);
    const res = await svc.stop("player-1");
    expect(res.isFail).toBe(true);
    expect(res.unwrapError().code).toBe("AUTO_BET_NOT_ACTIVE");
  });

  it("retry sob conflito de version (corrida com o reconcile do líder) → eventualmente para", async () => {
    // Falha o 1º save com concurrency; o retry recarrega e o 2º save passa.
    const svc = new AutoBetService(new FlakyRepo(activeSession(), 1), env);
    const res = await svc.stop("player-1");
    expect(res.isOk).toBe(true);
    expect(res.unwrap().status).toBe(AutoBetStatus.STOPPED);
  });
});
