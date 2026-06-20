import { describe, it, expect } from "bun:test";
import { Money } from "@crash-game/money";
import { Bet } from "../../src/domain/bet";
import { BetStatus } from "../../src/domain/bet-status";
import { DEFAULT_BET_LIMITS } from "../../src/domain/bet-limits";
import {
  BetCashedOut,
  BetConfirmed,
  BetLost,
  BetPlaced,
  BetRefunded,
  BetRejected,
} from "../../src/domain/bet-events";

const limits = DEFAULT_BET_LIMITS;
const NOW = new Date("2026-06-19T12:00:00.000Z");

function placeBet(
  overrides: {
    amount?: Money;
    autoCashoutTargetX100?: number | null;
  } = {},
): Bet {
  const res = Bet.place(
    {
      betId: "bet-1",
      roundId: "round-1",
      playerId: "player-1",
      amount: overrides.amount ?? Money.fromCents(1000), // 10,00
      autoCashoutTargetX100: overrides.autoCashoutTargetX100,
    },
    limits,
    NOW,
  );
  return res.unwrap();
}

function confirmedBet(amount?: Money): Bet {
  const bet = placeBet({ amount });
  bet.confirm(NOW);
  bet.pullEvents();
  return bet;
}

describe("Bet", () => {
  describe("place", () => {
    it("cria em PENDING_FUNDS e emite BetPlaced", () => {
      const bet = placeBet();
      expect(bet.status).toBe(BetStatus.PENDING_FUNDS);
      expect(bet.version).toBe(1);
      const events = bet.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(BetPlaced);
    });

    it("aceita valor exatamente no mín. e no máx.", () => {
      expect(placeBet({ amount: limits.min }).status).toBe(
        BetStatus.PENDING_FUNDS,
      );
      expect(placeBet({ amount: limits.max }).status).toBe(
        BetStatus.PENDING_FUNDS,
      );
    });

    it("rejeita valor abaixo do mín. ou acima do máx.", () => {
      const below = Bet.place(
        {
          betId: "b",
          roundId: "r",
          playerId: "p",
          amount: Money.fromCents(99),
        },
        limits,
        NOW,
      );
      expect(below.isFail).toBe(true);
      expect(below.unwrapError().code).toBe("BET_AMOUNT_OUT_OF_RANGE");

      const above = Bet.place(
        {
          betId: "b",
          roundId: "r",
          playerId: "p",
          amount: Money.fromCents(100_001),
        },
        limits,
        NOW,
      );
      expect(above.isFail).toBe(true);
    });

    it("aceita auto-cashout target válido e rejeita inválido", () => {
      expect(placeBet({ autoCashoutTargetX100: 250 }).autoCashoutTargetX100).toBe(
        250,
      );
      const invalid = Bet.place(
        {
          betId: "b",
          roundId: "r",
          playerId: "p",
          amount: Money.fromCents(1000),
          autoCashoutTargetX100: 100, // = 1.00x, não estritamente acima
        },
        limits,
        NOW,
      );
      expect(invalid.isFail).toBe(true);
      expect(invalid.unwrapError().code).toBe("INVALID_AUTO_CASHOUT_TARGET");
    });
  });

  describe("confirm / reject", () => {
    it("confirm: PENDING → CONFIRMED", () => {
      const bet = placeBet();
      bet.pullEvents();
      expect(bet.confirm(NOW).isOk).toBe(true);
      expect(bet.status).toBe(BetStatus.CONFIRMED);
      expect(bet.version).toBe(2);
      expect(bet.pullEvents()[0]).toBeInstanceOf(BetConfirmed);
    });

    it("reject: PENDING → REJECTED com motivo", () => {
      const bet = placeBet();
      bet.pullEvents();
      expect(bet.reject("insufficient_funds", NOW).isOk).toBe(true);
      expect(bet.status).toBe(BetStatus.REJECTED);
      const ev = bet.pullEvents()[0];
      expect(ev).toBeInstanceOf(BetRejected);
      expect((ev as BetRejected).reason).toBe("insufficient_funds");
    });

    it("confirm/reject fora de PENDING → fail", () => {
      const bet = confirmedBet();
      expect(bet.confirm(NOW).isFail).toBe(true);
      expect(bet.reject("x", NOW).unwrapError().code).toBe("BET_NOT_PENDING");
    });
  });

  describe("cashout", () => {
    it("CONFIRMED → CASHED_OUT com payout floor a favor da casa", () => {
      // 3,33 × 2.47x = 8,2251 → floor 8,22
      const bet = confirmedBet(Money.fromCents(333));
      const res = bet.cashout(247, 500, NOW);
      expect(res.isOk).toBe(true);
      expect(bet.status).toBe(BetStatus.CASHED_OUT);
      expect(bet.cashoutMultiplierX100).toBe(247);
      expect(bet.payout?.toCents()).toBe(822n);
      const ev = bet.pullEvents()[0];
      expect(ev).toBeInstanceOf(BetCashedOut);
      expect((ev as BetCashedOut).payoutCents).toBe(822n);
    });

    it("permite sacar exatamente no crash point", () => {
      const bet = confirmedBet(Money.fromCents(1000));
      expect(bet.cashout(500, 500, NOW).isOk).toBe(true);
      expect(bet.payout?.toCents()).toBe(5000n); // 10,00 × 5.00x
    });

    it("rejeita cashout acima do crash point", () => {
      const bet = confirmedBet();
      const res = bet.cashout(501, 500, NOW);
      expect(res.isFail).toBe(true);
      expect(res.unwrapError().code).toBe("CASHOUT_ABOVE_CRASH");
      expect(bet.status).toBe(BetStatus.CONFIRMED); // não mutou
    });

    it("rejeita multiplicador < 1.00x ou não-inteiro", () => {
      const bet = confirmedBet();
      expect(bet.cashout(99, 500, NOW).unwrapError().code).toBe(
        "INVALID_CASHOUT_MULTIPLIER",
      );
      expect(bet.cashout(150.5, 500, NOW).unwrapError().code).toBe(
        "INVALID_CASHOUT_MULTIPLIER",
      );
    });

    it("não pode sacar antes de CONFIRMED (ainda PENDING)", () => {
      const bet = placeBet();
      expect(bet.cashout(200, 500, NOW).unwrapError().code).toBe(
        "BET_NOT_CASHABLE",
      );
    });

    it("dupla liquidação: o 2º cashout falha (cliente em pânico)", () => {
      const bet = confirmedBet(Money.fromCents(1000));
      expect(bet.cashout(200, 500, NOW).isOk).toBe(true);
      const second = bet.cashout(200, 500, NOW);
      expect(second.isFail).toBe(true);
      expect(second.unwrapError().code).toBe("BET_NOT_CASHABLE");
      expect(bet.payout?.toCents()).toBe(2000n); // payout permanece o da 1ª
      expect(bet.version).toBe(3); // confirm(2) + cashout(3); o 2º não mutou
    });
  });

  describe("markLost", () => {
    it("CONFIRMED → LOST", () => {
      const bet = confirmedBet();
      expect(bet.markLost(NOW).isOk).toBe(true);
      expect(bet.status).toBe(BetStatus.LOST);
      expect(bet.pullEvents()[0]).toBeInstanceOf(BetLost);
    });

    it("markLost fora de CONFIRMED → fail", () => {
      const bet = placeBet();
      expect(bet.markLost(NOW).unwrapError().code).toBe("BET_NOT_CONFIRMED");
    });

    it("não pode perder uma aposta já sacada", () => {
      const bet = confirmedBet(Money.fromCents(1000));
      bet.cashout(200, 500, NOW);
      expect(bet.markLost(NOW).isFail).toBe(true);
      expect(bet.status).toBe(BetStatus.CASHED_OUT);
    });
  });

  describe("refund (compensação de late-debit)", () => {
    it("PENDING_FUNDS → REFUNDED emite BetRefunded", () => {
      const bet = placeBet();
      expect(bet.refund(NOW).isOk).toBe(true);
      expect(bet.status).toBe(BetStatus.REFUNDED);
      const events = bet.pullEvents();
      expect(events[events.length - 1]).toBeInstanceOf(BetRefunded);
    });

    it("refund fora de PENDING_FUNDS → fail (não é caso de refund)", () => {
      const bet = confirmedBet();
      expect(bet.refund(NOW).unwrapError().code).toBe("BET_NOT_PENDING");
      expect(bet.status).toBe(BetStatus.CONFIRMED);
    });

    it("não refunda duas vezes (estado terminal)", () => {
      const bet = placeBet();
      bet.refund(NOW);
      expect(bet.refund(NOW).isFail).toBe(true);
      expect(bet.status).toBe(BetStatus.REFUNDED);
    });
  });

  describe("reconstitute", () => {
    it("hidrata o estado sem emitir eventos", () => {
      const bet = Bet.reconstitute({
        betId: "b-9",
        roundId: "r-9",
        playerId: "p-9",
        amount: Money.fromCents(1000),
        status: BetStatus.CASHED_OUT,
        autoCashoutTargetX100: null,
        cashoutMultiplierX100: 200,
        payout: Money.fromCents(2000),
        version: 3,
        placedAt: NOW,
        confirmedAt: NOW,
        resolvedAt: NOW,
      });
      expect(bet.status).toBe(BetStatus.CASHED_OUT);
      expect(bet.payout?.toCents()).toBe(2000n);
      expect(bet.pullEvents()).toHaveLength(0);
    });
  });
});
