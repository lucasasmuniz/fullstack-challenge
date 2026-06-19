import { describe, it, expect } from "bun:test";
import { Round } from "../../src/domain/round";
import { RoundStatus } from "../../src/domain/round-status";
import {
  RoundCrashed,
  RoundOpened,
  RoundStarted,
  RoundSettled,
} from "../../src/domain/round-events";
import { ProvablyFairDomainService } from "../../src/domain/provably-fair.service";
import { DEFAULT_PROVABLY_FAIR_POLICY } from "../../src/domain/provably-fair-policy";

const pf = new ProvablyFairDomainService();
const policy = DEFAULT_PROVABLY_FAIR_POLICY;
const NOW = new Date("2026-06-19T12:00:00.000Z");
const SERVER_SEED = "server-seed-da-rodada";
const PUBLIC_SEED = "public-salt";

function openRound(now: Date = NOW): Round {
  return Round.open(
    {
      roundId: "round-1",
      roundNumber: 1,
      serverSeed: SERVER_SEED,
      serverSeedHash: pf.hashSeed(SERVER_SEED),
      publicSeed: PUBLIC_SEED,
      bettingEndsAt: new Date(now.getTime() + 10_000),
    },
    pf,
    policy,
    now,
  );
}

describe("Round", () => {
  describe("open", () => {
    it("abre em BETTING, deriva o crash point e fixa o commitment", () => {
      const round = openRound();
      expect(round.status).toBe(RoundStatus.BETTING);
      expect(round.crashPointX100).toBe(
        pf.deriveCrashPoint(SERVER_SEED, PUBLIC_SEED, policy),
      );
      expect(round.serverSeedHash).toBe(pf.hashSeed(SERVER_SEED));
      expect(round.version).toBe(1);
      expect(round.canAcceptBets()).toBe(true);
      expect(round.canCashout()).toBe(false);
    });

    it("emite RoundOpened sem vazar serverSeed nem crashPoint", () => {
      const round = openRound();
      const events = round.pullEvents();
      expect(events).toHaveLength(1);
      const [opened] = events;
      expect(opened).toBeInstanceOf(RoundOpened);
      // RoundOpened só carrega dados públicos (auditável por inspeção de tipo)
      expect(JSON.stringify(opened)).not.toContain(SERVER_SEED);
    });

    it("rejeita commitment que não corresponde à serverSeed", () => {
      expect(() =>
        Round.open(
          {
            roundId: "r",
            roundNumber: 1,
            serverSeed: SERVER_SEED,
            serverSeedHash: "hash-errado",
            publicSeed: PUBLIC_SEED,
            bettingEndsAt: NOW,
          },
          pf,
          policy,
          NOW,
        ),
      ).toThrow();
    });
  });

  describe("barreira da serverSeed (Garantia 1)", () => {
    it("lança ao tentar revelar em BETTING e em RUNNING", () => {
      const round = openRound();
      expect(() => round.getServerSeed()).toThrow();
      round.start(NOW);
      expect(() => round.getServerSeed()).toThrow();
    });

    it("revela após o crash (CRASHED e SETTLED)", () => {
      const round = openRound();
      round.start(NOW);
      round.crash(NOW);
      expect(round.getServerSeed()).toBe(SERVER_SEED);
      round.settle(NOW);
      expect(round.getServerSeed()).toBe(SERVER_SEED);
    });
  });

  describe("ciclo de vida", () => {
    it("BETTING → RUNNING → CRASHED → SETTLED, com eventos e version", () => {
      const round = openRound();
      round.pullEvents(); // drena o RoundOpened

      expect(round.start(NOW).isOk).toBe(true);
      expect(round.status).toBe(RoundStatus.RUNNING);
      expect(round.canCashout()).toBe(true);
      expect(round.version).toBe(2);

      expect(round.crash(NOW).isOk).toBe(true);
      expect(round.status).toBe(RoundStatus.CRASHED);
      expect(round.version).toBe(3);

      expect(round.settle(NOW).isOk).toBe(true);
      expect(round.status).toBe(RoundStatus.SETTLED);
      expect(round.version).toBe(4);

      const events = round.pullEvents();
      expect(events[0]).toBeInstanceOf(RoundStarted);
      expect(events[1]).toBeInstanceOf(RoundCrashed);
      expect(events[2]).toBeInstanceOf(RoundSettled);
    });

    it("RoundCrashed revela serverSeed + crashPoint para o verify", () => {
      const round = openRound();
      round.start(NOW);
      round.crash(NOW);
      const crashed = round
        .pullEvents()
        .find((e): e is RoundCrashed => e instanceof RoundCrashed);
      expect(crashed?.serverSeed).toBe(SERVER_SEED);
      expect(crashed?.crashPointX100).toBe(round.crashPointX100);
    });
  });

  describe("transições inválidas → Result.fail (sem mutar)", () => {
    it("start fora de BETTING", () => {
      const round = openRound();
      round.start(NOW);
      const res = round.start(NOW);
      expect(res.isFail).toBe(true);
      expect(res.unwrapError().code).toBe("INVALID_ROUND_TRANSITION");
      expect(round.status).toBe(RoundStatus.RUNNING);
    });

    it("crash fora de RUNNING", () => {
      const round = openRound();
      expect(round.crash(NOW).isFail).toBe(true);
      expect(round.status).toBe(RoundStatus.BETTING);
    });

    it("settle fora de CRASHED", () => {
      const round = openRound();
      round.start(NOW);
      expect(round.settle(NOW).isFail).toBe(true);
      expect(round.status).toBe(RoundStatus.RUNNING);
    });
  });

  describe("reconstitute", () => {
    it("hidrata o estado sem emitir eventos", () => {
      const round = Round.reconstitute({
        roundId: "r-9",
        roundNumber: 9,
        status: RoundStatus.CRASHED,
        crashPointX100: 247,
        serverSeedHash: pf.hashSeed(SERVER_SEED),
        serverSeed: SERVER_SEED,
        publicSeed: PUBLIC_SEED,
        version: 3,
        bettingEndsAt: NOW,
        startedAt: NOW,
        crashedAt: NOW,
        settledAt: null,
      });
      expect(round.status).toBe(RoundStatus.CRASHED);
      expect(round.crashPointX100).toBe(247);
      expect(round.getServerSeed()).toBe(SERVER_SEED); // CRASHED → revelável
      expect(round.pullEvents()).toHaveLength(0);
    });
  });
});
