import "reflect-metadata";
// Seta env (DATABASE_URL etc.) antes de tocar a config do ORM.
import "./e2e-env.setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { MikroORM } from "@mikro-orm/postgresql";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { Money } from "@crash-game/money";
import { createOrmConfig } from "../../src/infrastructure/database/orm.config";
import { MikroOrmWalletRepository } from "../../src/infrastructure/persistence/mikro-orm-wallet.repository";
import { Wallet } from "../../src/domain";

/**
 * Integração do event store (precisa do Postgres do `docker:up`). Cada teste usa um
 * `playerId` aleatório para não colidir com o seed nem entre execuções.
 */
const describeIT = process.env.RUN_E2E ? describe : describe.skip;
const DB_URL =
  process.env.DATABASE_URL ?? "postgresql://admin:admin@localhost:5432/wallets";

let orm: MikroORM;
let repo: MikroOrmWalletRepository;

async function expectRejection(
  promise: Promise<unknown>,
  instanceOf: new (...args: never[]) => Error,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(instanceOf);
    return;
  }
  throw new Error("Esperava rejeição, mas resolveu");
}

beforeAll(async () => {
  orm = await MikroORM.init(createOrmConfig(DB_URL));
  await orm.migrator.up(); // garante o schema (idempotente)
  repo = new MikroOrmWalletRepository(orm.em);
});

afterAll(async () => {
  await orm?.close(true);
});

/** UUID fixo do `player` semeado (== id no realm + Migration de seed). */
const SEED_PLAYER_ID = "11111111-1111-4111-8111-111111111111";

describeIT("MikroOrmWalletRepository (event store)", () => {
  it("seed: o fold do ledger semeado por SQL bate com a projeção (M1/W6)", async () => {
    const aggregate = await repo.findByPlayerId(SEED_PLAYER_ID);
    const view = await repo.findViewByPlayerId(SEED_PLAYER_ID);
    if (!aggregate || !view) throw new Error("carteira semeada não encontrada");

    // O saldo reconstruído dos eventos (bigint) == a projeção (bigint, via BigIntType).
    expect(aggregate.balance.toCents()).toBe(view.balanceCents);
    expect(aggregate.version).toBe(view.version);
    expect(aggregate.balance.toCents()).toBeGreaterThanOrEqual(100000n);
  });

  it("persiste eventos + projeção e reconstrói o agregado (fold)", async () => {
    const playerId = randomUUID();
    const wallet = Wallet.create({
      walletId: randomUUID(),
      playerId,
      currency: "BRL",
    }).unwrap();
    wallet.credit(Money.fromCents(5000n), "deposit", randomUUID());
    await repo.save(wallet);

    const loaded = await repo.findByPlayerId(playerId);
    if (!loaded) throw new Error("carteira não encontrada");
    expect(loaded.balance.toCents()).toBe(5000n);
    expect(loaded.version).toBe(2);

    const view = await repo.findViewByPlayerId(playerId);
    expect(view?.balanceCents).toBe(5000n);
  });

  it("idempotência: mesmo (reason, correlationId) viola UNIQUE (falha fechado)", async () => {
    const playerId = randomUUID();
    const key = randomUUID();
    const first = Wallet.create({
      walletId: randomUUID(),
      playerId,
      currency: "BRL",
    }).unwrap();
    first.credit(Money.fromCents(1000n), "deposit", key);
    await repo.save(first);
    expect(await repo.findProcessedMovement(first.id, "deposit", key)).toEqual({
      amountCents: 1000n,
    });

    const reloaded = await repo.findByPlayerId(playerId);
    if (!reloaded) throw new Error("carteira não encontrada");
    reloaded.credit(Money.fromCents(1000n), "deposit", key);
    await expectRejection(
      repo.save(reloaded),
      UniqueConstraintViolationException,
    );
  });

  it("concorrência otimista: conflito de version falha fechado", async () => {
    const playerId = randomUUID();
    const genesis = Wallet.create({
      walletId: randomUUID(),
      playerId,
      currency: "BRL",
    }).unwrap();
    await repo.save(genesis);

    const a = await repo.findByPlayerId(playerId);
    const b = await repo.findByPlayerId(playerId);
    if (!a || !b) throw new Error("carteira não encontrada");
    a.credit(Money.fromCents(100n), "deposit", randomUUID());
    b.credit(Money.fromCents(200n), "deposit", randomUUID());
    await repo.save(a);
    await expectRejection(repo.save(b), UniqueConstraintViolationException);
  });
});
