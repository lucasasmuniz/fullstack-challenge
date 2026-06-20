import { describe, it, expect } from "bun:test";
import { SeedBuffer } from "../../src/application/seed-buffer";
import type { ValkeyPort } from "../../src/application/valkey.port";
import type {
  ResolvedSeed,
  SeedChainMeta,
  SeedChainRepository,
  SeedRow,
} from "../../src/application/seed-chain.repository";
import type { GamesEnv } from "../../src/infrastructure/config/env.schema";

function buffered(index: number): string {
  return JSON.stringify({
    chainId: "chain-1",
    index,
    serverSeed: `buf-seed-${index.toString()}`,
    serverSeedHash: `buf-hash-${index.toString()}`,
    publicSeed: "pub",
  } satisfies ResolvedSeed);
}

class FakeValkey implements ValkeyPort {
  constructor(private list: string[] = []) {}
  failLpop = false;
  cleared = false;
  lpop(): Promise<string | null> {
    if (this.failLpop) return Promise.reject(new Error("valkey down"));
    return Promise.resolve(this.list.shift() ?? null);
  }
  rpush(_key: string, values: string[]): Promise<void> {
    this.list.push(...values);
    return Promise.resolve();
  }
  llen(): Promise<number> {
    return Promise.resolve(this.list.length);
  }
  del(): Promise<void> {
    this.cleared = true;
    this.list = [];
    return Promise.resolve();
  }
  setNxPx(): Promise<boolean> {
    return Promise.resolve(true);
  }
  renewIfOwner(): Promise<boolean> {
    return Promise.resolve(true);
  }
  releaseIfOwner(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeRepo implements Partial<SeedChainRepository> {
  active: SeedChainMeta | null = {
    id: "chain-1",
    length: 100,
    cursor: 7,
    publicSeed: "pub",
    beaconRound: null,
    rootCommitment: "root",
  };
  findActiveChain(): Promise<SeedChainMeta | null> {
    return Promise.resolve(this.active);
  }
  readSeeds(_c: string, from: number, limit: number): Promise<SeedRow[]> {
    return Promise.resolve(
      Array.from({ length: limit }, (_v, i) => ({
        index: from + i,
        serverSeed: `s${(from + i).toString()}`,
        serverSeedHash: `h${(from + i).toString()}`,
      })),
    );
  }
}

const env = {
  SEED_BUFFER_SIZE: 50,
  SEED_BUFFER_LOW_WATERMARK: 10,
} as unknown as GamesEnv;

function build(valkey: FakeValkey, repo: FakeRepo): SeedBuffer {
  return new SeedBuffer(valkey, repo as unknown as SeedChainRepository, env);
}

describe("SeedBuffer", () => {
  it("takeCandidate devolve o candidato do topo (LPOP)", async () => {
    const buffer = build(new FakeValkey([buffered(7)]), new FakeRepo());
    const seed = await buffer.takeCandidate();
    expect(seed?.index).toBe(7);
    expect(seed?.serverSeed).toBe("buf-seed-7");
  });

  it("takeCandidate devolve null em cache miss", async () => {
    const buffer = build(new FakeValkey([]), new FakeRepo());
    expect(await buffer.takeCandidate()).toBeNull();
  });

  it("takeCandidate devolve null se o Valkey estiver fora (não quebra)", async () => {
    const valkey = new FakeValkey([]);
    valkey.failLpop = true;
    expect(await build(valkey, new FakeRepo()).takeCandidate()).toBeNull();
  });

  it("refillIfLow enche o buffer a partir de cursor+len", async () => {
    const valkey = new FakeValkey([]);
    const buffer = build(valkey, new FakeRepo());
    await buffer.refillIfLow();
    expect(await valkey.llen()).toBe(env.SEED_BUFFER_SIZE);
  });

  it("refillIfLow não faz nada se o publicSeed da cadeia ativa não está resolvido", async () => {
    const valkey = new FakeValkey([]);
    const repo = new FakeRepo();
    repo.active = {
      id: "chain-1",
      length: 100,
      cursor: 7,
      publicSeed: null,
      beaconRound: null,
      rootCommitment: "root",
    };
    await build(valkey, repo).refillIfLow();
    expect(await valkey.llen()).toBe(0);
  });

  it("clear esvazia o buffer (rotação)", async () => {
    const valkey = new FakeValkey([buffered(1), buffered(2)]);
    await build(valkey, new FakeRepo()).clear();
    expect(valkey.cleared).toBe(true);
  });
});
