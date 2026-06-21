import { describe, it, expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { Money } from "@crash-game/money";
import type { IntegrationMessage } from "@crash-game/contracts";
import { BetSagaService } from "../../src/application/bet-saga.service";
import type {
  BetMessageOutcome,
  BetMutation,
  BetRepository,
  OutboxBuilder,
  OutboxMessage,
} from "../../src/application/bet.repository";
import type { RoundRepository } from "../../src/application/round.repository";
import { Bet } from "../../src/domain/bet";
import { BetStatus } from "../../src/domain/bet-status";
import { DEFAULT_BET_LIMITS } from "../../src/domain/bet-limits";
import { Round } from "../../src/domain/round";
import { RoundStatus } from "../../src/domain/round-status";
import type { RealtimePublisher } from "../../src/application/realtime.port";
import type {
  RealtimeEvent,
  RealtimeEventPayloads,
} from "@crash-game/realtime-contracts";

/** Fake do publisher WS: captura os eventos emitidos para a sala pública. */
class FakeRealtimePublisher implements RealtimePublisher {
  readonly emitted: { event: RealtimeEvent; payload: unknown }[] = [];
  emitToPublic<E extends RealtimeEvent>(
    event: E,
    payload: RealtimeEventPayloads[E],
  ): void {
    this.emitted.push({ event, payload });
  }
}

/** Monta a saga com fakes (realtime opcional para asserções de WS). */
function makeSaga(
  bets: FakeBetRepository,
  round: Round | null,
  realtime: RealtimePublisher = new FakeRealtimePublisher(),
): BetSagaService {
  return new BetSagaService(bets, new FakeRoundRepository(round), realtime);
}

const NOW = new Date("2026-06-20T12:00:00.000Z");
const PLAYER = "player-1";
const ROUND_ID = "round-1";

function pendingBet(betId = "bet-1"): Bet {
  const bet = Bet.place(
    {
      betId,
      roundId: ROUND_ID,
      playerId: PLAYER,
      username: "player",
      amount: Money.fromCents(2000),
    },
    DEFAULT_BET_LIMITS,
    NOW,
  ).unwrap();
  bet.pullEvents();
  return bet;
}

/** Round hidratado com um status arbitrário (reconstitute não valida seed/hash). */
function roundWith(status: RoundStatus): Round {
  return Round.reconstitute({
    roundId: ROUND_ID,
    roundNumber: 1,
    status,
    crashPointX100: 200,
    serverSeedHash: "hash",
    serverSeed: "seed",
    publicSeed: "public",
    chainId: "chain-1",
    chainIndex: 0,
    version: 1,
    bettingEndsAt: NOW,
    startedAt: NOW,
    crashedAt: status === RoundStatus.CRASHED ? NOW : null,
    settledAt: status === RoundStatus.SETTLED ? NOW : null,
  });
}

/** Fake do repo de aposta: aplica a `mutate` ao agregado guardado e registra outbox/outcome. */
class FakeBetRepository implements BetRepository {
  private bets = new Map<string, Bet>();
  private inbox = new Set<string>();
  readonly outbox: OutboxMessage[] = [];
  readonly outcomes: BetMessageOutcome[] = [];

  seed(bet: Bet): void {
    this.bets.set(bet.id, bet);
  }

  applyFromMessage(
    messageId: string,
    _messageType: string,
    betId: string,
    mutate: BetMutation,
    buildOutbox?: OutboxBuilder,
  ): Promise<BetMessageOutcome> {
    if (this.inbox.has(messageId)) {
      return this.record("duplicate"); // reentrega → ack seco
    }
    this.inbox.add(messageId);
    const bet = this.bets.get(betId);
    if (!bet) {
      return this.record("not_found");
    }
    const res = mutate(bet);
    if (res.isFail) {
      return this.record("no_op");
    }
    if (buildOutbox) {
      this.outbox.push(buildOutbox(bet));
    }
    return this.record("applied");
  }

  private record(outcome: BetMessageOutcome): Promise<BetMessageOutcome> {
    this.outcomes.push(outcome);
    return Promise.resolve(outcome);
  }

  // Não exercidos por estes testes (lado de comando da saga REST/settlement).
  place(): Promise<void> {
    return Promise.reject(new Error("não usado"));
  }
  saveWithOutbox(): Promise<void> {
    return Promise.reject(new Error("não usado"));
  }
  markRoundLost(): Promise<number> {
    return Promise.resolve(0);
  }
  findById(): Promise<Bet | null> {
    return Promise.resolve(null);
  }
  findByPlayerAndRound(): Promise<Bet | null> {
    return Promise.resolve(null);
  }
}

/** Fake do repo de rodada: `findById` devolve a rodada configurada. */
class FakeRoundRepository implements RoundRepository {
  constructor(private readonly round: Round | null) {}

  findById(): Promise<Round | null> {
    return Promise.resolve(this.round);
  }
  save(): Promise<void> {
    return Promise.reject(new Error("não usado"));
  }
  findCurrent(): Promise<Round | null> {
    return Promise.resolve(null);
  }
  findHistory(): Promise<Round[]> {
    return Promise.resolve([]);
  }
  findPreviousByRoundNumber(): Promise<Round | null> {
    return Promise.resolve(null);
  }
}

function debitedMsg(
  betId: string,
  roundId = ROUND_ID,
  messageId = randomUUID(),
): IntegrationMessage<"FundsDebited"> {
  return {
    messageId,
    type: "FundsDebited",
    occurredAt: NOW.toISOString(),
    payload: { betId, roundId, playerId: PLAYER, amountCents: 2000 },
  };
}

describe("BetSagaService.onFundsDebited (confirm vs refund)", () => {
  it("rodada RUNNING → confirma a aposta (CONFIRMED), sem outbox de refund", async () => {
    const bet = pendingBet();
    const bets = new FakeBetRepository();
    bets.seed(bet);
    const saga = makeSaga(bets, roundWith(RoundStatus.RUNNING));

    await saga.onFundsDebited(debitedMsg(bet.id));

    expect(bet.status).toBe(BetStatus.CONFIRMED);
    expect(bets.outbox).toHaveLength(0);
    expect(bets.outcomes).toEqual(["applied"]);
  });

  it("rodada CRASHED (late-debit) → refund + outbox CreditFunds{reason=refund}", async () => {
    const bet = pendingBet();
    const bets = new FakeBetRepository();
    bets.seed(bet);
    const saga = makeSaga(bets, roundWith(RoundStatus.CRASHED));

    await saga.onFundsDebited(debitedMsg(bet.id));

    expect(bet.status).toBe(BetStatus.REFUNDED);
    expect(bets.outbox).toHaveLength(1);
    expect(bets.outbox[0].type).toBe("CreditFunds");
    const payload = bets.outbox[0].payload as { reason: string; betId: string };
    expect(payload.reason).toBe("refund");
    expect(payload.betId).toBe(bet.id);
  });

  it("rodada SETTLED (terminal) também faz refund", async () => {
    const bet = pendingBet();
    const bets = new FakeBetRepository();
    bets.seed(bet);
    const saga = makeSaga(bets, roundWith(RoundStatus.SETTLED));

    await saga.onFundsDebited(debitedMsg(bet.id));

    expect(bet.status).toBe(BetStatus.REFUNDED);
    expect(bets.outbox).toHaveLength(1);
  });

  it("é idempotente: reentrega do mesmo messageId não confirma/refunda de novo", async () => {
    const bet = pendingBet();
    const bets = new FakeBetRepository();
    bets.seed(bet);
    const saga = makeSaga(bets, roundWith(RoundStatus.CRASHED));
    const msg = debitedMsg(bet.id);

    await saga.onFundsDebited(msg);
    await saga.onFundsDebited(msg); // reentrega

    expect(bet.status).toBe(BetStatus.REFUNDED);
    expect(bets.outbox).toHaveLength(1); // sem refund duplicado
    expect(bets.outcomes).toEqual(["applied", "duplicate"]);
  });
});

describe("BetSagaService — rejeição e crédito", () => {
  it("onFundsDebitRejected → REJECTED", async () => {
    const bet = pendingBet();
    const bets = new FakeBetRepository();
    bets.seed(bet);
    const saga = makeSaga(bets, null);

    await saga.onFundsDebitRejected({
      messageId: randomUUID(),
      type: "FundsDebitRejected",
      occurredAt: NOW.toISOString(),
      payload: {
        betId: bet.id,
        roundId: ROUND_ID,
        playerId: PLAYER,
        amountCents: 2000,
        reason: "Saldo insuficiente",
      },
    });

    expect(bet.status).toBe(BetStatus.REJECTED);
  });

  it("onFundsCredited → ack idempotente (não lança, não toca repositório)", async () => {
    const bets = new FakeBetRepository();
    const saga = makeSaga(bets, null);

    await saga.onFundsCredited({
      messageId: randomUUID(),
      type: "FundsCredited",
      occurredAt: NOW.toISOString(),
      payload: { betId: "bet-x", playerId: PLAYER, amountCents: 2020, reason: "cashout" },
    });

    expect(bets.outbox).toHaveLength(0);
    expect(bets.outcomes).toHaveLength(0);
  });
});
