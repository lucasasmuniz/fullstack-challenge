import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { ENV } from "@crash-game/nestjs-kit";
import type { GamesEnv } from "../config/env.schema";
import type { ValkeyPort } from "../../application/valkey.port";

/** Renova o TTL só se ainda formos o dono do lease (atômico). */
const RENEW_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end`;

/** Apaga o lease só se ainda formos o dono (atômico). */
const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/**
 * Adapter `ioredis` do {@link ValkeyPort}. O lease usa `SET NX PX` + scripts Lua para
 * renovar/soltar **escopados por dono** (evita um nó soltar o lease de outro).
 */
@Injectable()
export class IoredisValkeyClient implements ValkeyPort, OnModuleDestroy {
  private readonly logger = new Logger(IoredisValkeyClient.name);
  private readonly client: Redis;

  constructor(@Inject(ENV) env: GamesEnv) {
    this.client = new Redis(env.VALKEY_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    this.client.on("error", (err) => {
      this.logger.warn(`Valkey error: ${err.message}`);
    });
  }

  async lpop(key: string): Promise<string | null> {
    return this.client.lpop(key);
  }

  async rpush(key: string, values: string[]): Promise<void> {
    if (values.length > 0) {
      await this.client.rpush(key, ...values);
    }
  }

  async llen(key: string): Promise<number> {
    return this.client.llen(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setPx(key: string, value: string, ttlMs: number): Promise<void> {
    await this.client.set(key, value, "PX", ttlMs);
  }

  async setNxPx(key: string, value: string, ttlMs: number): Promise<boolean> {
    const result = await this.client.set(key, value, "PX", ttlMs, "NX");
    return result === "OK";
  }

  async renewIfOwner(
    key: string,
    value: string,
    ttlMs: number,
  ): Promise<boolean> {
    const result = await this.client.eval(
      RENEW_LUA,
      1,
      key,
      value,
      String(ttlMs),
    );
    return Number(result) === 1;
  }

  async releaseIfOwner(key: string, value: string): Promise<void> {
    await this.client.eval(RELEASE_LUA, 1, key, value);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
