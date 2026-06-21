import { describe, it, expect } from "bun:test";
import { LeaderLease } from "../../src/application/leader-lease";
import type { ValkeyPort } from "../../src/application/valkey.port";
import type { GamesEnv } from "../../src/infrastructure/config/env.schema";

interface Call {
  key: string;
  value: string;
  ttl?: number;
}

class RecordingValkey implements ValkeyPort {
  setResult = true;
  renewResult = true;
  lastSet: Call | null = null;
  lastRenew: Call | null = null;
  lastRelease: Call | null = null;

  lpop(): Promise<string | null> {
    return Promise.resolve(null);
  }
  rpush(): Promise<void> {
    return Promise.resolve();
  }
  llen(): Promise<number> {
    return Promise.resolve(0);
  }
  del(): Promise<void> {
    return Promise.resolve();
  }
  get(): Promise<string | null> {
    return Promise.resolve(null);
  }
  setPx(): Promise<void> {
    return Promise.resolve();
  }
  setNxPx(key: string, value: string, ttl: number): Promise<boolean> {
    this.lastSet = { key, value, ttl };
    return Promise.resolve(this.setResult);
  }
  renewIfOwner(key: string, value: string, ttl: number): Promise<boolean> {
    this.lastRenew = { key, value, ttl };
    return Promise.resolve(this.renewResult);
  }
  releaseIfOwner(key: string, value: string): Promise<void> {
    this.lastRelease = { key, value };
    return Promise.resolve();
  }
}

const env = { SCHEDULER_LEASE_TTL_MS: 10000 } as unknown as GamesEnv;

describe("LeaderLease", () => {
  it("acquire faz SET NX PX com a chave/ttl e devolve o resultado", async () => {
    const valkey = new RecordingValkey();
    const lease = new LeaderLease(valkey, env);
    const ok = await lease.acquire();
    expect(ok).toBe(true);
    expect(valkey.lastSet?.key).toBe("scheduler:leader");
    expect(valkey.lastSet?.ttl).toBe(10000);
  });

  it("usa o mesmo token entre acquire/renew/release", async () => {
    const valkey = new RecordingValkey();
    const lease = new LeaderLease(valkey, env);
    await lease.acquire();
    await lease.renew();
    await lease.release();
    expect(valkey.lastRenew?.value).toBe(valkey.lastSet?.value);
    expect(valkey.lastRelease?.value).toBe(valkey.lastSet?.value);
  });

  it("instâncias diferentes têm tokens diferentes", async () => {
    const a = new RecordingValkey();
    const b = new RecordingValkey();
    await new LeaderLease(a, env).acquire();
    await new LeaderLease(b, env).acquire();
    expect(a.lastSet?.value).not.toBe(b.lastSet?.value);
  });

  it("renew propaga false (perda de liderança)", async () => {
    const valkey = new RecordingValkey();
    valkey.renewResult = false;
    const lease = new LeaderLease(valkey, env);
    expect(await lease.renew()).toBe(false);
  });
});
