import { describe, it, expect } from "bun:test";
import { Money } from "@crash-game/money";
import {
  betPlacedPayload,
  betUpdatedFromBet,
  betUpdatedFromSaga,
  roundCrashedPayload,
  roundOpenedPayload,
  roundStartedPayload,
  roundTickPayload,
} from "../../src/application/realtime-events";
import { Bet } from "../../src/domain/bet";
import { DEFAULT_BET_LIMITS } from "../../src/domain/bet-limits";
import { Round } from "../../src/domain/round";
import { RoundStatus } from "../../src/domain/round-status";

const NOW = new Date("2026-06-20T12:00:00.000Z");

function round(status: RoundStatus): Round {
  return Round.reconstitute({
    roundId: "11111111-1111-4111-8111-111111111111",
    roundNumber: 7,
    status,
    crashPointX100: 247,
    serverSeedHash: "the-hash",
    serverSeed: "the-secret-seed",
    publicSeed: "the-public-seed",
    chainId: "chain-1",
    chainIndex: 0,
    version: 1,
    bettingEndsAt: NOW,
    startedAt: NOW,
    crashedAt: status === RoundStatus.CRASHED ? NOW : null,
    settledAt: null,
  });
}

describe("realtime-events — regra de não-vazamento de segredo", () => {
  it("round:opened NÃO carrega crashPoint nem serverSeed", () => {
    const payload = roundOpenedPayload(round(RoundStatus.BETTING));
    const json = JSON.stringify(payload);
    expect(json).not.toContain("the-secret-seed");
    expect(json).not.toContain("247");
    expect(payload.serverSeedHash).toBe("the-hash");
    expect(payload.publicSeed).toBe("the-public-seed");
  });

  it("round:started expõe só startedAt + growthRate (sem segredo)", () => {
    const payload = roundStartedPayload(round(RoundStatus.RUNNING), NOW, 0.06);
    const json = JSON.stringify(payload);
    expect(json).not.toContain("the-secret-seed");
    expect(json).not.toContain("247");
    expect(payload.growthRate).toBe(0.06);
  });

  it("round:tick tem elapsedMs autoritativo e NÃO vaza segredo", () => {
    const payload = roundTickPayload("r-1", 1234, 215);
    expect(payload.elapsedMs).toBe(1234);
    expect(payload.multiplierX100).toBe(215);
    expect(JSON.stringify(payload)).not.toContain("the-secret-seed");
  });

  it("round:crashed revela crashPoint e serverSeed (pós-crash)", () => {
    const payload = roundCrashedPayload(round(RoundStatus.CRASHED));
    expect(payload.crashPointX100).toBe(247);
    expect(payload.serverSeed).toBe("the-secret-seed");
  });
});

describe("realtime-events — apostas", () => {
  function bet(): Bet {
    return Bet.place(
      {
        betId: "bet-1",
        roundId: "r-1",
        playerId: "p-1",
        username: "alice",
        amount: Money.fromCents(2000),
      },
      DEFAULT_BET_LIMITS,
      NOW,
    ).unwrap();
  }

  it("bet:placed carrega username, amount e status PENDING_FUNDS", () => {
    const payload = betPlacedPayload(bet());
    expect(payload.username).toBe("alice");
    expect(payload.amountCents).toBe(2000);
    expect(payload.status).toBe("PENDING_FUNDS");
  });

  it("bet:updated (cashout) carrega username + multiplicador + payout", () => {
    const b = bet();
    b.confirm(NOW);
    b.cashout(150, 247, NOW); // 1.50x ≤ crash
    const payload = betUpdatedFromBet(b);
    expect(payload.status).toBe("CASHED_OUT");
    expect(payload.username).toBe("alice");
    expect(payload.cashoutMultiplierX100).toBe(150);
    expect(payload.payoutCents).toBe(3000); // floor(2000 * 150 / 100)
  });

  it("bet:updated (saga) é casado por betId, sem username", () => {
    const payload = betUpdatedFromSaga("bet-1", "r-1", "CONFIRMED");
    expect(payload.betId).toBe("bet-1");
    expect(payload.status).toBe("CONFIRMED");
    expect(payload.username).toBeUndefined();
  });
});
