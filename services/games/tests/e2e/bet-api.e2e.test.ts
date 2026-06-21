import "reflect-metadata";
import "./e2e-env.setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MikroORM } from "@mikro-orm/postgresql";
import { AppModule } from "../../src/app.module";
import { createOrmConfig } from "../../src/infrastructure/database/orm.config";
import { RoundEntity } from "../../src/infrastructure/persistence/round.entity";
import { BetEntity } from "../../src/infrastructure/persistence/bet.entity";

/**
 * E2E dos **endpoints HTTP de aposta** (`POST /bet`, `/bet/cashout`, `GET /bets/me`) com as
 * regras de negócio via API — o que o README pede ("aposta dupla, aposta durante rodada ativa,
 * cashout"). Determinístico: o scheduler/messaging ficam OFF (e2e-env) e as rodadas/apostas são
 * inseridas direto no banco com estado controlado (crashPoint alto → cashout sempre válido). A
 * saga cross-service (débito/crédito via SQS) é coberta por `bet-saga.e2e` (camada de repo).
 */
const describeE2E = process.env.RUN_E2E ? describe : describe.skip;
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const DB =
  process.env.DATABASE_URL ?? "postgresql://admin:admin@localhost:5432/games_test";

let app: INestApplication;
let baseUrl: string;
let orm: MikroORM;
let token: string;
let playerSub: string;
// Base de round_number reservada para este e2e (acima das rodadas reais), aleatória para não
// colidir com remanescentes de runs anteriores. `cleanup()` remove tudo daqui no before/afterAll.
const ROUND_BASE = 900_000_000;
let roundSeq = ROUND_BASE + Math.floor(Math.random() * 50_000_000);

async function getToken(): Promise<string> {
  const res = await fetch(
    `${KEYCLOAK_URL}/realms/crash-game/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "crash-game-client",
        username: "player",
        password: "player123",
      }),
    },
  );
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("token");
  return body.access_token;
}

function subOf(jwt: string): string {
  const payload = JSON.parse(
    Buffer.from(jwt.split(".")[1], "base64").toString("utf8"),
  ) as { sub: string };
  return payload.sub;
}

/** Remove o lixo deste e2e (apostas do player + rodadas de teste) — não polui outros e2e. */
async function cleanup(): Promise<void> {
  const em = orm.em.fork();
  await em.nativeDelete(BetEntity, { playerId: playerSub });
  await em.nativeDelete(RoundEntity, { roundNumber: { $gte: ROUND_BASE } });
}

/**
 * Insere uma rodada com estado controlado. O `roundNumber` crescente (acima das reais) garante
 * que ela é a `current` (`findCurrent` ordena por roundNumber desc) — sem mexer nas rodadas de
 * outros e2e (não usamos um UPDATE global, que poluiria o history deles).
 */
async function insertRound(status: "BETTING" | "RUNNING"): Promise<string> {
  const id = randomUUID();
  roundSeq += 1;
  const now = new Date();
  await orm.em.fork().insert(RoundEntity, {
    id,
    roundNumber: roundSeq,
    status,
    crashPointX100: 1_000_000, // 10000x → cashout no início da rodada sempre válido
    serverSeedHash: "hash",
    serverSeed: "seed",
    publicSeed: "public",
    chainId: randomUUID(),
    chainIndex: 0,
    version: 1,
    bettingEndsAt: new Date(now.getTime() + 60_000),
    startedAt: status === "RUNNING" ? now : null,
    crashedAt: null,
    settledAt: null,
    createdAt: now,
  });
  return id;
}

/** Insere uma aposta CONFIRMED do player (para exercitar o cashout). */
async function insertConfirmedBet(
  roundId: string,
  amountCents: number,
): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await orm.em.fork().insert(BetEntity, {
    id,
    roundId,
    playerId: playerSub,
    username: "player",
    amountCents: BigInt(amountCents),
    status: "CONFIRMED",
    autoCashoutTargetX100: null,
    cashoutMultiplierX100: null,
    payoutCents: null,
    version: 2,
    placedAt: now,
    confirmedAt: now,
    resolvedAt: null,
    createdAt: now,
  });
  return id;
}

function post(path: string, body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describeE2E("Bet API (HTTP, regras de negócio)", () => {
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    orm = await MikroORM.init(createOrmConfig(DB));
    token = await getToken();
    playerSub = subOf(token);
    await cleanup(); // limpa remanescentes de runs anteriores
  });

  afterAll(async () => {
    await cleanup(); // não deixa rodadas vivas poluindo o findCurrent de outros e2e
    await orm?.close(true);
    await app?.close();
  });

  it("POST /bet em BETTING → 201 (PENDING_FUNDS)", async () => {
    await insertRound("BETTING");
    const res = await post("/bet", { amountCents: 2000 });
    expect(res.status).toBe(201);
    const dto = (await res.json()) as { status: string };
    expect(dto.status).toBe("PENDING_FUNDS");
  });

  it("POST /bet duplicada na mesma rodada → 409", async () => {
    await insertRound("BETTING");
    expect((await post("/bet", { amountCents: 2000 })).status).toBe(201);
    expect((await post("/bet", { amountCents: 2000 })).status).toBe(409);
  });

  it("POST /bet durante rodada ativa (RUNNING) → 409", async () => {
    await insertRound("RUNNING");
    expect((await post("/bet", { amountCents: 2000 })).status).toBe(409);
  });

  it("POST /bet valor abaixo do mínimo (em BETTING) → 422", async () => {
    await insertRound("BETTING");
    expect((await post("/bet", { amountCents: 50 })).status).toBe(422);
  });

  it("POST /bet valor acima do máximo (em BETTING) → 422", async () => {
    await insertRound("BETTING");
    expect((await post("/bet", { amountCents: 200000 })).status).toBe(422);
  });

  it("POST /bet body inválido → 400", async () => {
    await insertRound("BETTING");
    expect((await post("/bet", { amountCents: 1.5 })).status).toBe(400);
  });

  it("POST /bet sem token → 401", async () => {
    await insertRound("BETTING");
    const res = await fetch(`${baseUrl}/bet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountCents: 2000 }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /bet/cashout com aposta CONFIRMED em RUNNING → 200 (CASHED_OUT + payout)", async () => {
    const roundId = await insertRound("RUNNING");
    await insertConfirmedBet(roundId, 2000);
    const res = await post("/bet/cashout");
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { status: string; payoutCents: number | null };
    expect(dto.status).toBe("CASHED_OUT");
    expect(dto.payoutCents).toBeGreaterThanOrEqual(2000); // payout = aposta × mult (≥ 1.00x)
  });

  it("POST /bet/cashout sem aposta na rodada → 404", async () => {
    await insertRound("RUNNING");
    expect((await post("/bet/cashout")).status).toBe(404);
  });

  it("POST /bet/cashout fora de RUNNING (BETTING) → 409", async () => {
    const roundId = await insertRound("BETTING");
    await insertConfirmedBet(roundId, 2000);
    expect((await post("/bet/cashout")).status).toBe(409);
  });

  it("GET /bets/me lista as apostas do jogador (com username)", async () => {
    await insertRound("BETTING");
    await post("/bet", { amountCents: 2000 });
    const res = await fetch(`${baseUrl}/bets/me?limit=5`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { username: string }[] };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].username).toBe("player");
  });
});
