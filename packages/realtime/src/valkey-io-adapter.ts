import type { Server as HttpServer } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { Server, ServerOptions } from "socket.io";

/**
 * `IoAdapter` que pluga o `@socket.io/redis-adapter` no Valkey — faz um `emit` numa instância
 * alcançar sockets de **outra** instância (fanout horizontal; R4). Usa 2 conexões ioredis
 * **dedicadas** (pub/sub bloqueiam a conexão), separadas da conexão de comandos do lease/buffer.
 *
 * **Gotcha sob Bun:** passar o `app` ao `IoAdapter` faz o `AbstractWsAdapter` capturar o http
 * server via `getUnderlyingHttpServer()`, que sob Bun é `undefined` **antes** de `app.listen()`
 * (criação lazy) → socket.io estoura `server.listeners is not a function` no attach. Passamos
 * `app.getHttpServer()` (que **força** a criação do `http.Server`) direto ao super.
 *
 * Registrado em `main.ts` via `app.useWebSocketAdapter(...)`. Em 1 instância o broadcast local
 * já basta, mas o adapter mantém a correção para escala. Chame `connect()` antes de usar.
 */
export class ValkeyIoAdapter extends IoAdapter {
  private adapterFactory?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(
    app: INestApplication,
    private readonly valkeyUrl: string,
  ) {
    // `getHttpServer()` força a criação do `http.Server` (lazy sob Bun) e é tipado `any` pelo
    // Nest — fixamos em `http.Server` para o super (que aceita o server diretamente).
    super(app.getHttpServer() as HttpServer);
  }

  async connect(): Promise<void> {
    this.pubClient = new Redis(this.valkeyUrl, { lazyConnect: true });
    this.subClient = this.pubClient.duplicate();
    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
    this.adapterFactory = createAdapter(this.pubClient, this.subClient);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterFactory) {
      server.adapter(this.adapterFactory);
    }
    return server;
  }

  override async dispose(): Promise<void> {
    await super.dispose();
    // `disconnect()` é idempotente (seguro se já fechado) — `app.close()` pode chamar dispose,
    // e o teste o chama de novo. Limpa as refs para não reprocessar.
    this.pubClient?.disconnect();
    this.subClient?.disconnect();
    this.pubClient = undefined;
    this.subClient = undefined;
  }
}
