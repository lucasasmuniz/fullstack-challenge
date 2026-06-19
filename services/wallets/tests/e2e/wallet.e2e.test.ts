import "reflect-metadata";
// Importado ANTES do AppModule: seta as envs (o AppModule valida env no load).
import "./e2e-env.setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MikroORM } from "@mikro-orm/postgresql";
import { AppModule } from "../../src/app.module";

/**
 * E2E REST do Wallet Service (precisa do `docker:up`: Postgres + Keycloak). Roda
 * contra a carteira semeada do `player`. Usa assertivas **relativas** (lê o saldo,
 * aplica delta) e `Idempotency-Key` aleatória por execução, para ser robusto a
 * re-runs sobre o mesmo banco.
 */
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const describeE2E = process.env.RUN_E2E ? describe : describe.skip;

interface WalletBody {
  balanceCents: number;
  currency: string;
}

let app: INestApplication;
let baseUrl: string;
let token: string;

async function getPlayerToken(): Promise<string> {
  const response = await fetch(
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
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error(`Falha ao obter token (status ${response.status})`);
  }
  return body.access_token;
}

function authHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  return { authorization: `Bearer ${token}`, ...extra };
}

async function getBalance(): Promise<number> {
  const res = await fetch(`${baseUrl}/me`, { headers: authHeaders() });
  expect(res.status).toBe(200);
  const body = (await res.json()) as WalletBody;
  return body.balanceCents;
}

describeE2E("Wallet REST", () => {
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    // O AppModule não passa pelo main.ts; garante o schema aqui (idempotente).
    await app.get(MikroORM).migrator.up();
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    token = await getPlayerToken();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("GET /me retorna a carteira semeada (BRL, saldo >= seed)", async () => {
    const res = await fetch(`${baseUrl}/me`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as WalletBody;
    expect(body.currency).toBe("BRL");
    expect(body.balanceCents).toBeGreaterThanOrEqual(100000);
  });

  it("POST / (create) na carteira já existente → 409", async () => {
    const res = await fetch(`${baseUrl}/`, {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(409);
  });

  it("deposit credita e é idempotente com a mesma Idempotency-Key", async () => {
    const before = await getBalance();
    const key = randomUUID();

    const first = await fetch(`${baseUrl}/deposit`, {
      method: "POST",
      headers: authHeaders({
        "content-type": "application/json",
        "idempotency-key": key,
      }),
      body: JSON.stringify({ amountCents: 2500 }),
    });
    expect(first.status).toBe(200);
    expect(((await first.json()) as WalletBody).balanceCents).toBe(before + 2500);

    // Retry com a MESMA key → não credita de novo.
    const retry = await fetch(`${baseUrl}/deposit`, {
      method: "POST",
      headers: authHeaders({
        "content-type": "application/json",
        "idempotency-key": key,
      }),
      body: JSON.stringify({ amountCents: 2500 }),
    });
    expect(retry.status).toBe(200);
    expect(((await retry.json()) as WalletBody).balanceCents).toBe(before + 2500);
  });

  it("mesma Idempotency-Key com valor diferente → 409 (W10)", async () => {
    const key = randomUUID();
    const first = await fetch(`${baseUrl}/deposit`, {
      method: "POST",
      headers: authHeaders({
        "content-type": "application/json",
        "idempotency-key": key,
      }),
      body: JSON.stringify({ amountCents: 1000 }),
    });
    expect(first.status).toBe(200);

    const conflict = await fetch(`${baseUrl}/deposit`, {
      method: "POST",
      headers: authHeaders({
        "content-type": "application/json",
        "idempotency-key": key,
      }),
      body: JSON.stringify({ amountCents: 9999 }), // payload diferente
    });
    expect(conflict.status).toBe(409);
  });

  it("withdraw debita respeitando o saldo", async () => {
    const before = await getBalance();
    const res = await fetch(`${baseUrl}/withdraw`, {
      method: "POST",
      headers: authHeaders({
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      }),
      body: JSON.stringify({ amountCents: 500 }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as WalletBody).balanceCents).toBe(before - 500);
  });

  it("withdraw acima do saldo → 409 (saldo insuficiente)", async () => {
    const res = await fetch(`${baseUrl}/withdraw`, {
      method: "POST",
      headers: authHeaders({
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      }),
      body: JSON.stringify({ amountCents: 999_999_999 }),
    });
    expect(res.status).toBe(409);
  });

  it("deposit sem Idempotency-Key → 400", async () => {
    const res = await fetch(`${baseUrl}/deposit`, {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ amountCents: 100 }),
    });
    expect(res.status).toBe(400);
  });

  it("deposit com amount inválido → 400", async () => {
    const res = await fetch(`${baseUrl}/deposit`, {
      method: "POST",
      headers: authHeaders({
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      }),
      body: JSON.stringify({ amountCents: 0 }),
    });
    expect(res.status).toBe(400);
  });

  it("rota protegida sem token → 401", async () => {
    const res = await fetch(`${baseUrl}/me`);
    expect(res.status).toBe(401);
  });
});
