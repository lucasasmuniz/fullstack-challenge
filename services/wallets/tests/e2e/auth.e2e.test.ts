import "reflect-metadata";
// Importado ANTES do AppModule: seta as envs (o AppModule valida env no load).
import "./e2e-env.setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../src/app.module";

/**
 * Matriz de autenticação do Wallet Service (E2E). Requer infra de pé
 * (`bun run docker:up`): Postgres (conexão do MikroORM) e Keycloak (token + JWKS).
 * Opt-in via `RUN_E2E=1` (o `bun run test:e2e` seta isso) para não rodar no
 * `bun test` da raiz, que não tem a infra no ar.
 */
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const describeE2E = process.env.RUN_E2E ? describe : describe.skip;

let app: INestApplication;
let baseUrl: string;

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
    throw new Error(`Failed to obtain token (status ${response.status})`);
  }
  return body.access_token;
}

describeE2E("Wallet auth matrix", () => {
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("GET /health é público (200 sem token)", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
  });

  it("GET /auth/me sem token → 401", async () => {
    const res = await fetch(`${baseUrl}/auth/me`);
    expect(res.status).toBe(401);
  });

  it("GET /auth/me com token inválido → 401", async () => {
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.status).toBe(401);
  });

  it("GET /auth/me com token válido → 200 + sub", async () => {
    const token = await getPlayerToken();
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const user = (await res.json()) as { sub: string; username: string };
    expect(typeof user.sub).toBe("string");
    expect(user.sub.length).toBeGreaterThan(0);
    expect(user.username).toBe("player");
  });
});
