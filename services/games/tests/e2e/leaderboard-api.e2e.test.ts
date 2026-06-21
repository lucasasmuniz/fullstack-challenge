import "reflect-metadata";
import "./e2e-env.setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MikroORM } from "@mikro-orm/postgresql";
import { AppModule } from "../../src/app.module";
import { createOrmConfig } from "../../src/infrastructure/database/orm.config";
import { BetEntity } from "../../src/infrastructure/persistence/bet.entity";

/**
 * E2E do leaderboard (`GET /leaderboard`, público). Insere apostas resolvidas com **usernames
 * controlados** e valida o ranking por lucro líquido (alice lucra, bob no prejuízo). Tolera
 * outras apostas no DB (asserta pelos usernames próprios, não por rank absoluto). Determinístico:
 * scheduler/messaging OFF (e2e-env).
 */
const describeE2E = process.env.RUN_E2E ? describe : describe.skip;
const DB =
  process.env.DATABASE_URL ?? "postgresql://admin:admin@localhost:5432/games_test";

let app: INestApplication;
let baseUrl: string;
let orm: MikroORM;

const ALICE = `lb-alice-${randomUUID().slice(0, 8)}`;
const BOB = `lb-bob-${randomUUID().slice(0, 8)}`;
const aliceId = randomUUID();
const bobId = randomUUID();

interface LeaderboardRow {
  rank: number;
  username: string;
  profitCents: number;
  betsCount: number;
}

async function insertBet(opts: {
  playerId: string;
  username: string;
  amountCents: bigint;
  status: "CASHED_OUT" | "LOST";
  payoutCents: bigint | null;
}): Promise<void> {
  const now = new Date();
  await orm.em.fork().insert(BetEntity, {
    id: randomUUID(),
    roundId: randomUUID(),
    playerId: opts.playerId,
    username: opts.username,
    amountCents: opts.amountCents,
    status: opts.status,
    autoCashoutTargetX100: null,
    cashoutMultiplierX100: opts.status === "CASHED_OUT" ? 150 : null,
    payoutCents: opts.payoutCents,
    version: 2,
    placedAt: now,
    confirmedAt: now,
    resolvedAt: now,
    createdAt: now,
  });
}

describeE2E("Leaderboard REST API", () => {
  beforeAll(async () => {
    orm = await MikroORM.init(createOrmConfig(DB));
    await orm.getMigrator().up();
    // alice: 2 vitórias (lucro 500 cada = +1000); bob: 1 vitória (+200) + 1 perda (−1000) = −800.
    await insertBet({ playerId: aliceId, username: ALICE, amountCents: 1000n, status: "CASHED_OUT", payoutCents: 1500n });
    await insertBet({ playerId: aliceId, username: ALICE, amountCents: 1000n, status: "CASHED_OUT", payoutCents: 1500n });
    await insertBet({ playerId: bobId, username: BOB, amountCents: 1000n, status: "CASHED_OUT", payoutCents: 1200n });
    await insertBet({ playerId: bobId, username: BOB, amountCents: 1000n, status: "LOST", payoutCents: null });

    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await orm.em.fork().nativeDelete(BetEntity, { playerId: { $in: [aliceId, bobId] } });
    await orm?.close(true);
    await app?.close();
  });

  it("GET /leaderboard (público, sem token) → 200 com ranking por lucro", async () => {
    const res = await fetch(`${baseUrl}/leaderboard?period=24h&limit=50`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { period: string; items: LeaderboardRow[] };
    expect(body.period).toBe("24h");

    const alice = body.items.find((i) => i.username === ALICE);
    const bob = body.items.find((i) => i.username === BOB);
    expect(alice?.profitCents).toBe(1000);
    expect(alice?.betsCount).toBe(2);
    expect(bob?.profitCents).toBe(-800);
    expect(bob?.betsCount).toBe(2);
    // alice (lucro) vem antes de bob (prejuízo) no ranking.
    expect(alice!.rank).toBeLessThan(bob!.rank);
  });

  it("period=week também funciona; period inválido → 400", async () => {
    const week = await fetch(`${baseUrl}/leaderboard?period=week`);
    expect(week.status).toBe(200);

    const bad = await fetch(`${baseUrl}/leaderboard?period=month`);
    expect(bad.status).toBe(400);
  });
});
