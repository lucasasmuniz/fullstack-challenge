/**
 * Port do Valkey (hexagonal) — só as operações que a aplicação precisa: lista (buffer de
 * seeds) e lease do líder (SET NX PX + Lua de renovação/release escopados por dono). O
 * adapter `ioredis` fica na infraestrutura; testes usam um fake.
 */
export interface ValkeyPort {
  lpop(key: string): Promise<string | null>;
  rpush(key: string, values: string[]): Promise<void>;
  llen(key: string): Promise<number>;
  del(key: string): Promise<void>;

  /** Lê uma chave simples (cache). `null` se ausente/expirada. */
  get(key: string): Promise<string | null>;
  /** `SET key value PX ttlMs` (cache com expiração; sobrescreve). */
  setPx(key: string, value: string, ttlMs: number): Promise<void>;

  /** `SET key value NX PX ttlMs` → `true` se adquiriu (chave não existia). */
  setNxPx(key: string, value: string, ttlMs: number): Promise<boolean>;
  /** Estende o TTL **só se** o valor for `value` (Lua atômico) → `true` se ainda é dono. */
  renewIfOwner(key: string, value: string, ttlMs: number): Promise<boolean>;
  /** Apaga **só se** o valor for `value` (Lua atômico) — release seguro do lease. */
  releaseIfOwner(key: string, value: string): Promise<void>;
}

export const VALKEY = Symbol("VALKEY");
