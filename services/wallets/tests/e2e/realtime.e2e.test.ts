import "reflect-metadata";
import "./e2e-env.setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ValkeyIoAdapter } from "@crash-game/realtime";
import { RealtimeEvent } from "@crash-game/realtime-contracts";
import { io, type Socket } from "socket.io-client";
import { AppModule } from "../../src/app.module";
import { WalletGateway } from "../../src/infrastructure/websocket/wallet.gateway";

/**
 * E2E do WebSocket da Wallet: handshake **estrito** (sem token → rejeita) + push de saldo
 * **privado** (só a sala `user:{sub}` recebe). Requer infra (Postgres + Valkey + Keycloak).
 */
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const describeE2E = process.env.RUN_E2E ? describe : describe.skip;
// `sub` do `player` (pin do realm/seed) — a sala privada é `user:{sub}`.
const PLAYER_SUB = "11111111-1111-4111-8111-111111111111";

let app: INestApplication;
let adapter: ValkeyIoAdapter;
let url: string;
let gateway: WalletGateway;
const openSockets: Socket[] = [];

async function getPlayerToken(): Promise<string> {
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

function connect(auth?: { token: string }): Promise<Socket> {
  const socket = io(url, {
    path: "/wallets/socket.io/",
    transports: ["websocket"],
    auth,
    reconnection: false,
  });
  openSockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => {
      socket.close(); // fecha o cliente rejeitado (senão fica pendurado no afterAll)
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

describeE2E("Wallet realtime (WebSocket)", () => {
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    adapter = new ValkeyIoAdapter(app, process.env.VALKEY_URL ?? "");
    adapter.forceCloseConnections = true; // não espera conexões no app.close() (teardown rápido)
    await adapter.connect();
    app.useWebSocketAdapter(adapter);
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
    gateway = app.get(WalletGateway);
  });

  afterAll(async () => {
    for (const s of openSockets) s.close();
    // Handshakes rejeitados deixam conexões keep-alive que pendurariam o `close()` sob Bun.
    const http = app.getHttpServer() as { closeAllConnections?: () => void };
    http.closeAllConnections?.();
    await app?.close();
  });

  /** Espera que a conexão seja REJEITADA no handshake (resolve→falha; reject→ok). */
  async function expectRejected(p: Promise<Socket>): Promise<void> {
    try {
      const socket = await p;
      socket.disconnect();
      throw new Error("conexão deveria ter sido rejeitada");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
    }
  }

  it("rejeita conexão SEM token (handshake estrito)", async () => {
    await expectRejected(connect());
  });

  it("rejeita conexão com token inválido", async () => {
    await expectRejected(connect({ token: "garbage" }));
  });

  it("aceita token válido e recebe balance:updated na sua sala privada", async () => {
    const token = await getPlayerToken();
    const socket = await connect({ token });
    expect(socket.connected).toBe(true);

    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout balance")), 2000);
      socket.once(RealtimeEvent.BalanceUpdated, (p: unknown) => {
        clearTimeout(timer);
        resolve(p);
      });
    });
    gateway.emitBalance(PLAYER_SUB, { balanceCents: 12345, currency: "BRL" });
    const payload = await received;
    expect(payload).toEqual({ balanceCents: 12345, currency: "BRL" });
    socket.disconnect();
  });
});
