import "reflect-metadata";
import "./e2e-env.setup";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MikroORM } from "@mikro-orm/postgresql";
import { AppModule } from "../../src/app.module";
import { createOrmConfig } from "../../src/infrastructure/database/orm.config";
import { AutoBetSessionEntity } from "../../src/infrastructure/persistence/auto-bet-session.entity";

/**
 * E2E dos endpoints REST de auto-bet (`POST /autobet`, `GET /autobet/me`, `POST /autobet/stop`).
 * Determinístico: scheduler/messaging OFF (e2e-env) — testa só o CRUD da sessão + validações +
 * a invariante "1 sessão ativa por jogador". A execução por rodada (runner) é coberta pelo
 * system-test cross-service.
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

async function cleanup(): Promise<void> {
  await orm.em.fork().nativeDelete(AutoBetSessionEntity, { playerId: playerSub });
}

function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

const validBody = {
  strategy: "MARTINGALE",
  baseAmountCents: 100,
  autoCashoutTargetX100: 150,
  stopLossCents: 5000,
  budgetCents: 20000,
};

describeE2E("Auto-bet REST API", () => {
  beforeAll(async () => {
    orm = await MikroORM.init(createOrmConfig(DB));
    await orm.getMigrator().up();
    token = await getToken();
    playerSub = subOf(token);
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await cleanup();
    await orm?.close(true);
    await app?.close();
  });

  beforeEach(async () => {
    await cleanup();
  });

  it("POST /autobet sem token → 401", async () => {
    const res = await fetch(`${baseUrl}/autobet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
  });

  it("POST /autobet válido → 201 ACTIVE", async () => {
    const res = await fetch(`${baseUrl}/autobet`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const dto = (await res.json()) as { status: string; nextAmountCents: number };
    expect(dto.status).toBe("ACTIVE");
    expect(dto.nextAmountCents).toBe(100);
  });

  it("GET /autobet/me: null sem sessão; ACTIVE após criar; STOPPED após parar (mais recente)", async () => {
    const none = await fetch(`${baseUrl}/autobet/me`, { headers: authHeaders() });
    expect(await none.json()).toBeNull(); // beforeEach limpou

    await fetch(`${baseUrl}/autobet`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });
    const me = await fetch(`${baseUrl}/autobet/me`, { headers: authHeaders() });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { status: string }).status).toBe("ACTIVE");

    const stop = await fetch(`${baseUrl}/autobet/stop`, {
      method: "POST",
      headers: authHeaders(),
    });
    expect(stop.status).toBe(200);
    expect(((await stop.json()) as { status: string }).status).toBe("STOPPED");

    // /me devolve a mais recente (STOPPED), não null — o frontend mostra o resultado final.
    const after = await fetch(`${baseUrl}/autobet/me`, { headers: authHeaders() });
    expect(((await after.json()) as { status: string }).status).toBe("STOPPED");
  });

  it("POST /autobet 2× → 409 (já existe sessão ativa)", async () => {
    await fetch(`${baseUrl}/autobet`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });
    const dup = await fetch(`${baseUrl}/autobet`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(dup.status).toBe(409);
  });

  it("POST /autobet/stop sem sessão ativa → 409", async () => {
    const res = await fetch(`${baseUrl}/autobet/stop`, {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(409);
  });

  it("validação: sem stopLoss → 400; alvo ≤ 1.00x → 400; budget < base → 422", async () => {
    const noStopLoss = await fetch(`${baseUrl}/autobet`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...validBody, stopLossCents: undefined }),
    });
    expect(noStopLoss.status).toBe(400);

    const badTarget = await fetch(`${baseUrl}/autobet`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...validBody, autoCashoutTargetX100: 100 }),
    });
    expect(badTarget.status).toBe(400);

    const badBudget = await fetch(`${baseUrl}/autobet`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...validBody, baseAmountCents: 1000, budgetCents: 500 }),
    });
    expect(badBudget.status).toBe(422);
  });
});
