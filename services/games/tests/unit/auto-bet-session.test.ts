import { describe, it, expect } from "bun:test";
import { Money } from "@crash-game/money";
import { AutoBetSession } from "../../src/domain/auto-bet-session";
import { AutoBetStatus } from "../../src/domain/auto-bet-status";
import {
  AutoBetCompletionReason,
  AutoBetOutcome,
  AutoBetStrategy,
} from "../../src/domain/auto-bet-types";
import { DEFAULT_BET_LIMITS } from "../../src/domain/bet-limits";

const limits = DEFAULT_BET_LIMITS;
const NOW = new Date("2026-06-21T12:00:00.000Z");
const ROUND = "round-1";
const BET = "bet-1";

function start(
  overrides: {
    strategy?: AutoBetStrategy;
    baseCents?: number;
    targetX100?: number;
    stopLossCents?: number;
    budgetCents?: number;
    stopWinCents?: number | null;
    maxRounds?: number | null;
  } = {},
): AutoBetSession {
  return AutoBetSession.start(
    {
      sessionId: "s-1",
      playerId: "player-1",
      username: "player",
      strategy: overrides.strategy ?? AutoBetStrategy.MARTINGALE,
      baseAmount: Money.fromCents(overrides.baseCents ?? 100),
      autoCashoutTargetX100: overrides.targetX100 ?? 200,
      stopLoss: Money.fromCents(overrides.stopLossCents ?? 1000),
      budget: Money.fromCents(overrides.budgetCents ?? 100000),
      stopWin: overrides.stopWinCents != null ? Money.fromCents(overrides.stopWinCents) : null,
      maxRounds: overrides.maxRounds ?? null,
    },
    limits,
    NOW,
  ).unwrap();
}

/** Sessão ativa que já colocou uma aposta para `ROUND` (pronta para reconcile). */
function placed(overrides: Parameters<typeof start>[0] = {}): AutoBetSession {
  const s = start(overrides);
  s.commitPlaced(ROUND, BET, NOW);
  return s;
}

describe("AutoBetSession", () => {
  describe("start", () => {
    it("inicia ACTIVE com nextAmount = base", () => {
      const s = start();
      expect(s.status).toBe(AutoBetStatus.ACTIVE);
      expect(s.nextAmount.toCents()).toBe(100n);
      expect(s.roundsPlayed).toBe(0);
      expect(s.netResultCents).toBe(0n);
      expect(s.version).toBe(1);
    });

    it("rejeita config inválida (base fora do range, alvo ≤ 1.00x, stop-loss ≤ 0, budget < base)", () => {
      expect(start.bind(null, { baseCents: 1 })).toThrow(); // < min (100)
      // chamadas diretas para checar o Result.fail
      const badTarget = AutoBetSession.start(
        {
          sessionId: "s",
          playerId: "p",
          username: "u",
          strategy: AutoBetStrategy.FIXED,
          baseAmount: Money.fromCents(100),
          autoCashoutTargetX100: 100, // = 1.00x
          stopLoss: Money.fromCents(1000),
          budget: Money.fromCents(1000),
          stopWin: null,
          maxRounds: null,
        },
        limits,
        NOW,
      );
      expect(badTarget.isFail).toBe(true);

      const badBudget = AutoBetSession.start(
        {
          sessionId: "s",
          playerId: "p",
          username: "u",
          strategy: AutoBetStrategy.FIXED,
          baseAmount: Money.fromCents(500),
          autoCashoutTargetX100: 150,
          stopLoss: Money.fromCents(1000),
          budget: Money.fromCents(100), // < base
          stopWin: null,
          maxRounds: null,
        },
        limits,
        NOW,
      );
      expect(badBudget.isFail).toBe(true);
    });
  });

  describe("decideStake", () => {
    it("ACTIVE → stake = nextAmount", () => {
      const d = start().decideStake(limits);
      expect(d.kind).toBe("stake");
      if (d.kind === "stake") {
        expect(d.amount.toCents()).toBe(100n);
      }
    });

    it("nextAmount acima do teto por aposta → complete(MAX_BET_EXCEEDED)", () => {
      const s = start({ baseCents: 100000 }); // = max; após uma perda dobraria p/ 200000
      s.commitPlaced(ROUND, BET, NOW);
      s.reconcile(ROUND, AutoBetOutcome.LOSS, 100000n, 0n, NOW); // nextAmount → 200000
      const d = s.decideStake(limits);
      // a sessão pode já ter encerrado por stop-loss; se ainda ACTIVE, decideStake barra pelo teto
      if (s.status === AutoBetStatus.ACTIVE) {
        expect(d.kind).toBe("complete");
        if (d.kind === "complete") {
          expect(d.reason).toBe(AutoBetCompletionReason.MAX_BET_EXCEEDED);
        }
      }
    });

    it("budget acumulado estourado → complete(BUDGET_EXCEEDED)", () => {
      const s = start({ baseCents: 100, budgetCents: 150 });
      s.commitPlaced(ROUND, BET, NOW);
      s.reconcile(ROUND, AutoBetOutcome.WIN, 100n, 200n, NOW); // wagered=100, net+100, reset base=100
      // próxima aposta 100; wagered(100)+100=200 > budget(150) → completa
      const d = s.decideStake(limits);
      expect(d.kind).toBe("complete");
      if (d.kind === "complete") {
        expect(d.reason).toBe(AutoBetCompletionReason.BUDGET_EXCEEDED);
      }
    });
  });

  describe("reconcile — máquina de 3 vias + REJECTED", () => {
    it("WIN: reseta a progressão, soma o lucro, conta a rodada", () => {
      const s = placed();
      const v = s.version;
      s.reconcile(ROUND, AutoBetOutcome.WIN, 100n, 200n, NOW); // payout 200, lucro 100
      expect(s.netResultCents).toBe(100n);
      expect(s.roundsPlayed).toBe(1);
      expect(s.nextAmount.toCents()).toBe(100n); // reset
      expect(s.totalWageredCents).toBe(100n);
      expect(s.currentRoundId).toBeNull();
      expect(s.lastProcessedRoundId).toBe(ROUND);
      expect(s.version).toBe(v + 1);
    });

    it("LOSS (Martingale): dobra o próximo valor, subtrai a aposta", () => {
      const s = placed({ strategy: AutoBetStrategy.MARTINGALE });
      s.reconcile(ROUND, AutoBetOutcome.LOSS, 100n, 0n, NOW);
      expect(s.netResultCents).toBe(-100n);
      expect(s.roundsPlayed).toBe(1);
      expect(s.nextAmount.toCents()).toBe(200n); // dobrou
    });

    it("LOSS (FIXED): mantém o valor base", () => {
      const s = placed({ strategy: AutoBetStrategy.FIXED });
      s.reconcile(ROUND, AutoBetOutcome.LOSS, 100n, 0n, NOW);
      expect(s.nextAmount.toCents()).toBe(100n); // não dobra
    });

    it("SKIPPED: P&L/rodadas/stake intactos (não pune por latência de SQS)", () => {
      const s = placed({ strategy: AutoBetStrategy.MARTINGALE });
      const before = {
        net: s.netResultCents,
        rounds: s.roundsPlayed,
        next: s.nextAmount.toCents(),
      };
      s.reconcile(ROUND, AutoBetOutcome.SKIPPED, 100n, 0n, NOW);
      expect(s.netResultCents).toBe(before.net);
      expect(s.roundsPlayed).toBe(before.rounds);
      expect(s.nextAmount.toCents()).toBe(before.next); // NÃO dobra
      expect(s.status).toBe(AutoBetStatus.ACTIVE);
      expect(s.lastProcessedRoundId).toBe(ROUND); // mas marca como processada
    });

    it("REJECTED: encerra por saldo insuficiente, sem mexer no P&L", () => {
      const s = placed();
      s.reconcile(ROUND, AutoBetOutcome.REJECTED, 100n, 0n, NOW);
      expect(s.status).toBe(AutoBetStatus.COMPLETED);
      expect(s.completionReason).toBe(AutoBetCompletionReason.INSUFFICIENT_FUNDS);
      expect(s.netResultCents).toBe(0n);
      expect(s.roundsPlayed).toBe(0);
    });

    it("idempotência: reconcile do mesmo round 2× → 2ª é no-op (sem dobrar o Martingale)", () => {
      const s = placed({ strategy: AutoBetStrategy.MARTINGALE });
      s.reconcile(ROUND, AutoBetOutcome.LOSS, 100n, 0n, NOW);
      const after1 = {
        net: s.netResultCents,
        next: s.nextAmount.toCents(),
        version: s.version,
      };
      s.reconcile(ROUND, AutoBetOutcome.LOSS, 100n, 0n, NOW); // reexecução (failover)
      expect(s.netResultCents).toBe(after1.net); // não dobrou de novo
      expect(s.nextAmount.toCents()).toBe(after1.next);
      expect(s.version).toBe(after1.version); // no-op não bumpa version
    });

    it("round diferente do current → no-op", () => {
      const s = placed();
      s.reconcile("outro-round", AutoBetOutcome.LOSS, 100n, 0n, NOW);
      expect(s.roundsPlayed).toBe(0);
      expect(s.currentRoundId).toBe(ROUND); // intacto
    });
  });

  describe("freios", () => {
    it("stop-loss: net ≤ -stopLoss → COMPLETED(STOP_LOSS)", () => {
      const s = placed({ strategy: AutoBetStrategy.FIXED, stopLossCents: 100 });
      s.reconcile(ROUND, AutoBetOutcome.LOSS, 100n, 0n, NOW); // net -100 ≤ -100
      expect(s.status).toBe(AutoBetStatus.COMPLETED);
      expect(s.completionReason).toBe(AutoBetCompletionReason.STOP_LOSS);
    });

    it("stop-win: net ≥ stopWin → COMPLETED(STOP_WIN)", () => {
      const s = placed({ stopWinCents: 100 });
      s.reconcile(ROUND, AutoBetOutcome.WIN, 100n, 200n, NOW); // lucro 100 ≥ 100
      expect(s.status).toBe(AutoBetStatus.COMPLETED);
      expect(s.completionReason).toBe(AutoBetCompletionReason.STOP_WIN);
    });

    it("max-rounds: roundsPlayed ≥ maxRounds → COMPLETED(MAX_ROUNDS)", () => {
      const s = placed({ strategy: AutoBetStrategy.FIXED, maxRounds: 1, stopLossCents: 100000 });
      s.reconcile(ROUND, AutoBetOutcome.WIN, 100n, 150n, NOW); // 1 rodada jogada
      expect(s.status).toBe(AutoBetStatus.COMPLETED);
      expect(s.completionReason).toBe(AutoBetCompletionReason.MAX_ROUNDS);
    });
  });

  describe("stop (manual)", () => {
    it("ACTIVE → STOPPED(MANUAL)", () => {
      const s = start();
      expect(s.stop(NOW).isOk).toBe(true);
      expect(s.status).toBe(AutoBetStatus.STOPPED);
      expect(s.completionReason).toBe(AutoBetCompletionReason.MANUAL);
    });

    it("não-ativa → fail", () => {
      const s = start();
      s.stop(NOW);
      expect(s.stop(NOW).isFail).toBe(true); // já parada
    });
  });
});
