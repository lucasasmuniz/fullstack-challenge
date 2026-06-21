import "reflect-metadata";
import "./e2e-env.setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ValkeyIoAdapter } from "@crash-game/realtime";
import { RealtimeEvent } from "@crash-game/realtime-contracts";
import { io, type Socket } from "socket.io-client";
import { AppModule } from "../../src/app.module";
import { GameGateway } from "../../src/infrastructure/websocket/game.gateway";

/**
 * E2E do WebSocket do Game (R4: múltiplas conexões = mesmo estado). Requer infra (Postgres +
 * Valkey + Keycloak). Conecta 2 clientes socket.io **WebSocket-only** e verifica que um evento
 * emitido pelo gateway chega idêntico a ambos. O scheduler fica desligado no e2e, então emitimos
 * via `GameGateway.emitToPublic` (o caminho que o scheduler usa pós-commit).
 */
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const describeE2E = process.env.RUN_E2E ? describe : describe.skip;

let app: INestApplication;
let adapter: ValkeyIoAdapter;
let url: string;
let gateway: GameGateway;

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

/** Conecta um cliente socket.io WebSocket-only e resolve quando `connect` dispara. */
function connect(auth?: { token: string }): Promise<Socket> {
  const socket = io(url, {
    path: "/games/socket.io/",
    transports: ["websocket"],
    auth,
    reconnection: false,
  });
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => {
      socket.close();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

/** Resolve no próximo evento `event` recebido (com timeout). */
function nextEvent<T>(socket: Socket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describeE2E("Game realtime (WebSocket)", () => {
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    adapter = new ValkeyIoAdapter(app, process.env.VALKEY_URL ?? "");
    await adapter.connect();
    app.useWebSocketAdapter(adapter);
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
    gateway = app.get(GameGateway);
  });

  afterAll(async () => {
    const http = app.getHttpServer() as { closeAllConnections?: () => void };
    http.closeAllConnections?.(); // evita pendurar o close sob Bun (conexões keep-alive)
    await app?.close(); // dispara adapter.dispose() (fecha as conexões ioredis pub/sub)
  });

  it("conecta como WebSocket-only (sem long-polling)", async () => {
    const socket = await connect();
    expect(socket.connected).toBe(true);
    expect(socket.io.engine.transport.name).toBe("websocket");
    socket.disconnect();
  });

  it("2 conexões recebem o MESMO round:opened (R4)", async () => {
    const [a, b] = await Promise.all([connect(), connect()]);
    const payload = {
      roundId: "11111111-1111-4111-8111-111111111111",
      roundNumber: 42,
      serverSeedHash: "hash",
      publicSeed: "public",
      bettingEndsAt: new Date().toISOString(),
    };
    const recvA = nextEvent(a, RealtimeEvent.RoundOpened);
    const recvB = nextEvent(b, RealtimeEvent.RoundOpened);
    gateway.emitToPublic(RealtimeEvent.RoundOpened, payload);
    const [gotA, gotB] = await Promise.all([recvA, recvB]);
    expect(gotA).toEqual(payload);
    expect(gotB).toEqual(payload);
    a.disconnect();
    b.disconnect();
  });

  it("aceita conexão anônima (híbrido) e também com token válido", async () => {
    const anon = await connect();
    expect(anon.connected).toBe(true);
    anon.disconnect();

    const token = await getPlayerToken();
    const authed = await connect({ token });
    expect(authed.connected).toBe(true);
    authed.disconnect();
  });

  it("token inválido NÃO derruba a conexão (rebaixa para anônimo)", async () => {
    const socket = await connect({ token: "garbage" });
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });
});
