import { Inject, Injectable, Logger } from "@nestjs/common";
import { ENV } from "@crash-game/nestjs-kit";
import type { GamesEnv } from "../config/env.schema";
import type { PublicSeedBeacon } from "../../application/public-seed-beacon.port";

interface DrandLatest {
  round: number;
  randomness: string;
}

/**
 * Adapter drand (League of Entropy) do {@link PublicSeedBeacon}. HTTP, com timeout e
 * fallback: se o beacon estiver inacessível, devolve `null` (o chamador usa CSPRNG).
 *
 * `commitFutureRound`: lê a rodada atual e commita `atual + BEACON_ROUND_LEAD` (futura,
 * imprevisível). `resolve`: busca aquela rodada, fazendo polling até ela ser produzida
 * (limitado por `BEACON_POLL_MAX_MS`).
 */
@Injectable()
export class DrandPublicSeedBeacon implements PublicSeedBeacon {
  private readonly logger = new Logger(DrandPublicSeedBeacon.name);

  constructor(@Inject(ENV) private readonly env: GamesEnv) {}

  async commitFutureRound(): Promise<string | null> {
    if (!this.env.BEACON_ENABLED) {
      return null;
    }
    const latest = await this.fetchJson<DrandLatest>("public/latest");
    if (!latest) {
      this.logger.warn("Beacon indisponível no commit — fallback CSPRNG.");
      return null;
    }
    return String(latest.round + this.env.BEACON_ROUND_LEAD);
  }

  async resolve(reference: string): Promise<string | null> {
    if (!this.env.BEACON_ENABLED) {
      return null;
    }
    const round = Number.parseInt(reference, 10);
    if (!Number.isInteger(round) || round <= 0) {
      return null;
    }
    const deadline = Date.now() + this.env.BEACON_POLL_MAX_MS;
    for (;;) {
      const value = await this.fetchJson<DrandLatest>(`public/${String(round)}`);
      if (value?.randomness) {
        return value.randomness;
      }
      if (Date.now() >= deadline) {
        this.logger.warn(
          `Beacon round ${String(round)} não disponível a tempo — fallback CSPRNG.`,
        );
        return null;
      }
      await delay(1000);
    }
  }

  private async fetchJson<T>(path: string): Promise<T | null> {
    const url = `${this.env.BEACON_BASE_URL}/${this.env.BEACON_CHAIN_HASH}/${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.env.BEACON_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        return null;
      }
      return (await res.json()) as T;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
