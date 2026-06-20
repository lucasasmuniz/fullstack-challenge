import "reflect-metadata";
import "./e2e-env.setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { MikroORM } from "@mikro-orm/postgresql";
import { createOrmConfig } from "../../src/infrastructure/database/orm.config";
import { MikroOrmRoundRepository } from "../../src/infrastructure/persistence/mikro-orm-round.repository";
import { MikroOrmRoundOpener } from "../../src/infrastructure/persistence/mikro-orm-round-opener";
import { MikroOrmSeedChainRepository } from "../../src/infrastructure/persistence/mikro-orm-seed-chain.repository";
import { SeedChainEntity } from "../../src/infrastructure/persistence/seed-chain.entity";
import { RoundConcurrencyError } from "../../src/application/round.repository";
import type { GamesEnv } from "../../src/infrastructure/config/env.schema";
import { ProvablyFairDomainService } from "../../src/domain";

/**
 * Integração da persistência do Game (precisa do Postgres do `docker:up`). Opt-in via
 * `RUN_E2E`. Cobre: abertura **atômica** (opener) gap-free, fencing por `version` no
 * `save`, leitura current/history, e os desfechos exhausted/stale.
 */
const describeIT = process.env.RUN_E2E ? describe : describe.skip;
const DB_URL =
  process.env.DATABASE_URL ?? "postgresql://admin:admin@localhost:5432/games";

const env = {
  BETTING_WINDOW_MS: 8000,
  PROVABLY_FAIR_INSTANT_BUST_DIVISOR: 101,
  PROVABLY_FAIR_MAX_CRASH_X100: 1000000,
} as unknown as GamesEnv;

let orm: MikroORM;
let rounds: MikroOrmRoundRepository;
let seeds: MikroOrmSeedChainRepository;
let opener: MikroOrmRoundOpener;
const pf = new ProvablyFairDomainService();
const NOW = new Date("2026-06-19T12:00:00.000Z");

beforeAll(async () => {
  orm = await MikroORM.init(createOrmConfig(DB_URL));
  await orm.migrator.up();
  rounds = new MikroOrmRoundRepository(orm.em);
  seeds = new MikroOrmSeedChainRepository(orm.em);
  opener = new MikroOrmRoundOpener(orm.em, pf, env);
});

afterAll(async () => {
  await orm.close(true);
});

/** Cria e ativa uma cadeia nova de `length` seeds (desativa qualquer ativa antes). */
async function activateFreshChain(length: number): Promise<string> {
  await orm.em
    .fork()
    .nativeUpdate(SeedChainEntity, { active: true }, { active: false });
  const id = randomUUID();
  const chain = pf.generateChain(`base-${id}`, length);
  await seeds.createChain({
    id,
    rootCommitment: pf.hashSeed(chain[0]),
    length: chain.length,
    beaconRound: null,
    seeds: chain.map((serverSeed, index) => ({
      index,
      serverSeed,
      serverSeedHash: pf.hashSeed(serverSeed),
    })),
  });
  await seeds.setPublicSeed(id, "test-public");
  await seeds.promoteChain(id, id);
  return id;
}

describeIT("MikroOrmRoundOpener (atomic open)", () => {
  it("abre rodadas gap-free (cursor 0,1,2…) e marca current", async () => {
    const chainId = await activateFreshChain(5);

    const r0 = await opener.open(null);
    const r1 = await opener.open(null);
    if (r0.kind !== "opened" || r1.kind !== "opened") {
      throw new Error("esperava opened");
    }
    expect(r0.round.chainId).toBe(chainId);
    expect(r0.round.chainIndex).toBe(0);
    expect(r1.round.chainIndex).toBe(1);

    const current = await rounds.findCurrent();
    expect(current?.roundNumber).toBe(r1.round.roundNumber);
  });

  it("rejeita candidato stale (índice ≠ cursor)", async () => {
    await activateFreshChain(3);
    const stale = await opener.open({
      chainId: randomUUID(),
      index: 99,
      serverSeed: "x",
      serverSeedHash: "y",
      publicSeed: "z",
    });
    expect(stale.kind).toBe("stale");
  });

  it("sinaliza exhausted quando a cadeia esgota", async () => {
    await activateFreshChain(1);
    const first = await opener.open(null);
    expect(first.kind).toBe("opened");
    const second = await opener.open(null);
    expect(second.kind).toBe("exhausted");
  });
});

describeIT("MikroOrmRoundRepository", () => {
  it("transiciona e lê history; serverSeed revelado pós-crash", async () => {
    await activateFreshChain(3);
    const opened = await opener.open(null);
    if (opened.kind !== "opened") throw new Error("esperava opened");
    const round = opened.round;

    round.start(NOW);
    await rounds.save(round);
    round.crash(NOW);
    await rounds.save(round);
    round.settle(NOW);
    await rounds.save(round);

    const fetched = await rounds.findById(round.id);
    expect(fetched?.status).toBe("SETTLED");
    expect(fetched?.getServerSeed()).toBe(round.getServerSeed());

    const history = await rounds.findHistory(10, 0);
    expect(history.some((r) => r.id === round.id)).toBe(true);
  });

  it("fencing: save com version defasada → RoundConcurrencyError", async () => {
    await activateFreshChain(3);
    const opened = await opener.open(null);
    if (opened.kind !== "opened") throw new Error("esperava opened");

    const a = await rounds.findById(opened.round.id);
    const b = await rounds.findById(opened.round.id);
    if (!a || !b) throw new Error("setup");

    a.start(NOW);
    await rounds.save(a); // version 1 → 2, ok

    b.start(NOW); // b ainda acha que está na version 1
    // bun:test tipa `.rejects` como não-thenable → try/catch manual (ver journal Etapa 1).
    let caught: unknown;
    try {
      await rounds.save(b);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RoundConcurrencyError);
  });
});
