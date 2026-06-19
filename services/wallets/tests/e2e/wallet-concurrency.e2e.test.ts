import "reflect-metadata";
import "./e2e-env.setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { MikroORM } from "@mikro-orm/postgresql";
import { Money } from "@crash-game/money";
import { createOrmConfig } from "../../src/infrastructure/database/orm.config";
import { MikroOrmWalletRepository } from "../../src/infrastructure/persistence/mikro-orm-wallet.repository";
import { DepositHandler } from "../../src/application/deposit.handler";
import { WithdrawHandler } from "../../src/application/withdraw.handler";
import { WalletMovementService } from "../../src/application/wallet-movement.service";
import { Wallet } from "../../src/domain";

/**
 * Chaos: concorrência real no fluxo de dinheiro (precisa do Postgres do `docker:up`).
 * Prova que dois movimentos concorrentes com **keys distintas** não se perdem (o
 * conflito de version é resolvido por retry, não reportado como falso sucesso — F1).
 */
const describeIT = process.env.RUN_E2E ? describe : describe.skip;
const DB_URL =
  process.env.DATABASE_URL ?? "postgresql://admin:admin@localhost:5432/wallets";

let orm: MikroORM;
let repo: MikroOrmWalletRepository;
let deposit: DepositHandler;
let withdraw: WithdrawHandler;

async function seedWallet(playerId: string, cents: bigint): Promise<void> {
  const wallet = Wallet.create({
    walletId: randomUUID(),
    playerId,
    currency: "BRL",
  }).unwrap();
  wallet.credit(Money.fromCents(cents), "initial", randomUUID());
  await repo.save(wallet);
}

beforeAll(async () => {
  orm = await MikroORM.init(createOrmConfig(DB_URL));
  await orm.migrator.up(); // garante o schema (idempotente)
  repo = new MikroOrmWalletRepository(orm.em);
  const movements = new WalletMovementService(repo);
  deposit = new DepositHandler(movements);
  withdraw = new WithdrawHandler(movements);
});

afterAll(async () => {
  await orm?.close(true);
});

describeIT("Wallet money — concorrência (F1)", () => {
  it("dois depósitos concorrentes (keys distintas) SOMAM, nenhum se perde", async () => {
    const playerId = randomUUID();
    await seedWallet(playerId, 0n);

    const [a, b] = await Promise.all([
      deposit.execute(playerId, 1000n, randomUUID()),
      deposit.execute(playerId, 2000n, randomUUID()),
    ]);
    expect(a.isOk).toBe(true);
    expect(b.isOk).toBe(true);

    const view = await repo.findViewByPlayerId(playerId);
    expect(view?.balanceCents).toBe(3000n); // 1000 + 2000, nada perdido
  });

  it("depósito concorrente com a MESMA key credita só uma vez (idempotente)", async () => {
    const playerId = randomUUID();
    await seedWallet(playerId, 0n);
    const key = randomUUID();

    const [a, b] = await Promise.all([
      deposit.execute(playerId, 5000n, key),
      deposit.execute(playerId, 5000n, key),
    ]);
    expect(a.isOk).toBe(true);
    expect(b.isOk).toBe(true);

    const view = await repo.findViewByPlayerId(playerId);
    expect(view?.balanceCents).toBe(5000n); // creditou 1x, não 2x
  });

  it("idempotência é isolada por carteira: a mesma key em players distintos credita ambos (X1)", async () => {
    const playerA = randomUUID();
    const playerB = randomUUID();
    await seedWallet(playerA, 0n);
    await seedWallet(playerB, 0n);
    const sharedKey = randomUUID();

    const a = await deposit.execute(playerA, 1000n, sharedKey);
    const b = await deposit.execute(playerB, 1000n, sharedKey);
    expect(a.isOk).toBe(true);
    expect(b.isOk).toBe(true);

    // A key do A NÃO pode descartar o depósito do B (bug de isolamento).
    expect((await repo.findViewByPlayerId(playerA))?.balanceCents).toBe(1000n);
    expect((await repo.findViewByPlayerId(playerB))?.balanceCents).toBe(1000n);
  });

  it("saques concorrentes não causam overdraw (saldo nunca negativo)", async () => {
    const playerId = randomUUID();
    await seedWallet(playerId, 1000n);

    // dois saques de 700 sobre saldo 1000: só um pode passar.
    const [a, b] = await Promise.all([
      withdraw.execute(playerId, 700n, randomUUID()),
      withdraw.execute(playerId, 700n, randomUUID()),
    ]);

    const oks = [a, b].filter((r) => r.isOk).length;
    expect(oks).toBe(1); // exatamente um saque bem-sucedido

    const view = await repo.findViewByPlayerId(playerId);
    expect(view?.balanceCents).toBe(300n); // 1000 - 700; nunca negativo
  });
});
