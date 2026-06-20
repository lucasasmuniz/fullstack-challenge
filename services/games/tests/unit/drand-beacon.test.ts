import { describe, it, expect } from "bun:test";
import { DrandPublicSeedBeacon } from "../../src/infrastructure/seed/drand-public-seed-beacon";
import type { GamesEnv } from "../../src/infrastructure/config/env.schema";

function beacon(overrides: Partial<GamesEnv>): DrandPublicSeedBeacon {
  const env = {
    BEACON_ENABLED: true,
    BEACON_BASE_URL: "https://api.drand.sh",
    BEACON_CHAIN_HASH: "abc",
    BEACON_ROUND_LEAD: 2,
    BEACON_TIMEOUT_MS: 1000,
    BEACON_POLL_MAX_MS: 0,
    ...overrides,
  } as unknown as GamesEnv;
  return new DrandPublicSeedBeacon(env);
}

describe("DrandPublicSeedBeacon", () => {
  it("desabilitado: commit e resolve devolvem null (fallback CSPRNG no chamador)", async () => {
    const b = beacon({ BEACON_ENABLED: false });
    expect(await b.commitFutureRound()).toBeNull();
    expect(await b.resolve("123")).toBeNull();
  });

  it("resolve com referência inválida devolve null", async () => {
    const b = beacon({});
    expect(await b.resolve("não-numérico")).toBeNull();
    expect(await b.resolve("0")).toBeNull();
  });
});
