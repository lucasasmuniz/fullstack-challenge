import "reflect-metadata";
import "./e2e-env.setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { MikroORM } from "@mikro-orm/postgresql";
import { Money } from "@crash-game/money";
import { createOrmConfig } from "../../src/infrastructure/database/orm.config";
import { MikroOrmBetRepository } from "../../src/infrastructure/persistence/mikro-orm-bet.repository";
import { BetEntity } from "../../src/infrastructure/persistence/bet.entity";
import { OutboxEntity } from "../../src/infrastructure/persistence/outbox.entity";
import type { OutboxMessage } from "../../src/application/bet.repository";
import { BetConcurrencyError } from "../../src/application/bet.repository";
import { Bet, BetAlreadyExistsError, DEFAULT_BET_LIMITS } from "../../src/domain";

/**
 * Integração da persistência da saga no Game (Postgres `games_test`). Opt-in `RUN_E2E`.
 * Cobre: `place` atômico (bet + outbox), `UNIQUE(round_id, player_id)` (aposta dupla),
 * `applyFromMessage` (confirm) + inbox dedup (reentrega) + no-op (estado terminal).
 */
const describeIT = process.env.RUN_E2E ? describe : describe.skip;
const DB_URL =
  process.env.DATABASE_URL ?? "postgresql://admin:admin@localhost:5432/games_test";

let orm: MikroORM;
let bets: MikroOrmBetRepository;
const NOW = new Date("2026-06-20T12:00:00.000Z");

beforeAll(async () => {
  orm = await MikroORM.init(createOrmConfig(DB_URL));
  await orm.migrator.up();
  bets = new MikroOrmBetRepository(orm.em);
});

afterAll(async () => {
  await orm.close(true);
});

function newBet(roundId: string, playerId: string, cents = 500): Bet {
  return Bet.place(
    {
      betId: randomUUID(),
      roundId,
      playerId,
      username: "player",
      amount: Money.fromCents(cents),
    },
    DEFAULT_BET_LIMITS,
    NOW,
  ).unwrap();
}

function debitOutbox(bet: Bet): OutboxMessage {
  return {
    id: randomUUID(),
    type: "DebitFunds",
    payload: {
      betId: bet.id,
      roundId: bet.roundId,
      playerId: bet.playerId,
      amountCents: Number(bet.amount.toCents()),
    },
  };
}

function creditOutbox(bet: Bet, reason: "cashout" | "refund"): OutboxMessage {
  return {
    id: randomUUID(),
    type: "CreditFunds",
    payload: {
      betId: bet.id,
      playerId: bet.playerId,
      amountCents: Number((bet.payout ?? bet.amount).toCents()),
      reason,
    },
  };
}

/** Coloca + confirma uma aposta (estado `CONFIRMED` no banco). */
async function placeAndConfirm(roundId: string, playerId: string, cents = 500): Promise<Bet> {
  const bet = newBet(roundId, playerId, cents);
  await bets.place(bet, debitOutbox(bet));
  await bets.applyFromMessage(randomUUID(), "FundsDebited", bet.id, (b) =>
    b.confirm(NOW),
  );
  return bet;
}

describeIT("MikroOrmBetRepository (saga 5a)", () => {
  it("place grava aposta (PENDING) + outbox DebitFunds na mesma tx", async () => {
    const roundId = randomUUID();
    const bet = newBet(roundId, randomUUID());
    await bets.place(bet, debitOutbox(bet));

    const em = orm.em.fork();
    const row = await em.findOne(BetEntity, { id: bet.id });
    expect(row?.status).toBe("PENDING_FUNDS");
    const outbox = await em.find(OutboxEntity, { status: "pending" });
    expect(outbox.some((o) => o.type === "DebitFunds")).toBe(true);
  });

  it("aposta dupla na mesma rodada → BetAlreadyExistsError", async () => {
    const roundId = randomUUID();
    const playerId = randomUUID();
    const first = newBet(roundId, playerId);
    await bets.place(first, debitOutbox(first));

    const second = newBet(roundId, playerId);
    let caught: unknown;
    try {
      await bets.place(second, debitOutbox(second));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(BetAlreadyExistsError);
  });

  it("applyFromMessage confirma e é idempotente (reentrega = duplicate)", async () => {
    const bet = newBet(randomUUID(), randomUUID());
    await bets.place(bet, debitOutbox(bet));

    const messageId = randomUUID();
    const first = await bets.applyFromMessage(messageId, "FundsDebited", bet.id, (b) =>
      b.confirm(NOW),
    );
    expect(first).toBe("applied");

    const em = orm.em.fork();
    const confirmed = await em.findOne(BetEntity, { id: bet.id });
    expect(confirmed?.status).toBe("CONFIRMED");

    // mesma mensagem reentregue → dedup pela inbox
    const replay = await bets.applyFromMessage(messageId, "FundsDebited", bet.id, (b) =>
      b.confirm(NOW),
    );
    expect(replay).toBe("duplicate");
  });

  it("transição inválida (confirmar bet já confirmada, msg nova) → no_op", async () => {
    const bet = newBet(randomUUID(), randomUUID());
    await bets.place(bet, debitOutbox(bet));
    await bets.applyFromMessage(randomUUID(), "FundsDebited", bet.id, (b) =>
      b.confirm(NOW),
    );

    const outcome = await bets.applyFromMessage(
      randomUUID(),
      "FundsDebited",
      bet.id,
      (b) => b.confirm(NOW),
    );
    expect(outcome).toBe("no_op");
  });

  it("rejeita o débito recusado (FundsDebitRejected → REJECTED)", async () => {
    const bet = newBet(randomUUID(), randomUUID());
    await bets.place(bet, debitOutbox(bet));
    const outcome = await bets.applyFromMessage(
      randomUUID(),
      "FundsDebitRejected",
      bet.id,
      (b) => b.reject("insufficient", NOW),
    );
    expect(outcome).toBe("applied");

    const em = orm.em.fork();
    const row = await em.findOne(BetEntity, { id: bet.id });
    expect(row?.status).toBe("REJECTED");
  });
});

describeIT("MikroOrmBetRepository (saga 5b)", () => {
  it("saveWithOutbox: cashout → CASHED_OUT + outbox CreditFunds(cashout)", async () => {
    const bet = await placeAndConfirm(randomUUID(), randomUUID(), 1000);
    const loaded = await bets.findById(bet.id);
    if (!loaded) throw new Error("setup");
    loaded.cashout(150, 200, NOW); // 1.50x ≤ 2.00x crash
    await bets.saveWithOutbox(loaded, creditOutbox(loaded, "cashout"));

    const em = orm.em.fork();
    const row = await em.findOne(BetEntity, { id: bet.id });
    expect(row?.status).toBe("CASHED_OUT");
    expect(row?.payoutCents).toBe(1500n);
    const out = await em.find(OutboxEntity, { status: "pending" });
    expect(out.some((o) => o.type === "CreditFunds")).toBe(true);
  });

  it("saveWithOutbox com version defasada → BetConcurrencyError (anti dupla-liquidação)", async () => {
    const bet = await placeAndConfirm(randomUUID(), randomUUID());
    const a = await bets.findById(bet.id);
    const b = await bets.findById(bet.id);
    if (!a || !b) throw new Error("setup");

    a.cashout(120, 200, NOW);
    await bets.saveWithOutbox(a, creditOutbox(a, "cashout")); // v2 → v3, ok

    b.cashout(120, 200, NOW); // b ainda na v2
    let caught: unknown;
    try {
      await bets.saveWithOutbox(b, creditOutbox(b, "cashout"));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(BetConcurrencyError);
  });

  it("markRoundLost: bulk CONFIRMED→LOST; CASHED_OUT intacto; idempotente", async () => {
    const roundId = randomUUID();
    await placeAndConfirm(roundId, randomUUID()); // fica CONFIRMED
    const cashed = await placeAndConfirm(roundId, randomUUID());
    const loaded = await bets.findById(cashed.id);
    if (!loaded) throw new Error("setup");
    loaded.cashout(120, 200, NOW);
    await bets.saveWithOutbox(loaded, creditOutbox(loaded, "cashout")); // CASHED_OUT

    const n = await bets.markRoundLost(roundId);
    expect(n).toBe(1); // só a CONFIRMED

    const em = orm.em.fork();
    const rows = await em.find(BetEntity, { roundId });
    const byStatus = rows.map((r) => r.status).sort();
    expect(byStatus).toEqual(["CASHED_OUT", "LOST"]);

    // idempotente: re-settle não toca em nada
    expect(await bets.markRoundLost(roundId)).toBe(0);
  });

  it("refund via applyFromMessage: PENDING → REFUNDED + outbox CreditFunds(refund)", async () => {
    const bet = newBet(randomUUID(), randomUUID(), 700);
    await bets.place(bet, debitOutbox(bet));

    const outcome = await bets.applyFromMessage(
      randomUUID(),
      "FundsDebited",
      bet.id,
      (b) => b.refund(NOW),
      (b) => creditOutbox(b, "refund"),
    );
    expect(outcome).toBe("applied");

    const em = orm.em.fork();
    const row = await em.findOne(BetEntity, { id: bet.id });
    expect(row?.status).toBe("REFUNDED");
    const out = await em.find(OutboxEntity, { type: "CreditFunds", status: "pending" });
    expect(out.length).toBeGreaterThan(0);
  });
});
