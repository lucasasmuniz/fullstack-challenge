import type { Server as HttpServer } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { Server, ServerOptions } from "socket.io";

/**
 * `IoAdapter` que pluga o `@socket.io/redis-adapter` no Valkey — um `emit` numa instância alcança
 * sockets de outra (fanout horizontal). Usa 2 conexões ioredis dedicadas (pub/sub bloqueiam a conexão).
 *
 * Gotcha sob Bun: passamos `app.getHttpServer()` (não o `app`) ao super porque `getUnderlyingHttpServer()`
 * é `undefined` antes de `app.listen()` (criação lazy) → socket.io estoura no attach. Chame `connect()`
 * antes de usar.
 */
export class ValkeyIoAdapter extends IoAdapter {
  private adapterFactory?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(
    app: INestApplication,
    private readonly valkeyUrl: string,
  ) {
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
    this.pubClient?.disconnect();
    this.subClient?.disconnect();
    this.pubClient = undefined;
    this.subClient = undefined;
  }
}
