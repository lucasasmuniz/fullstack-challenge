import { Inject, Injectable, Logger } from "@nestjs/common";
import { ENV } from "@crash-game/nestjs-kit";
import type { GamesEnv } from "../infrastructure/config/env.schema";
import { VALKEY, type ValkeyPort } from "./valkey.port";
import {
  SEED_CHAIN_REPOSITORY,
  type ResolvedSeed,
  type SeedChainRepository,
} from "./seed-chain.repository";

const BUFFER_KEY = "seed:buffer";

/**
 * Buffer hot (Valkey) de seeds — **otimização**, não fonte da verdade (ADR 0013). Provê um
 * **candidato** (read-ahead) para a abertura da rodada; o consumo autoritativo e atômico
 * (cursor + insert) acontece no {@link RoundOpener}, que valida o candidato contra o cursor.
 * Em cache miss / Valkey fora / candidato stale, o opener cai para o consumo cold.
 */
@Injectable()
export class SeedBuffer {
  private readonly logger = new Logger(SeedBuffer.name);

  constructor(
    @Inject(VALKEY) private readonly valkey: ValkeyPort,
    @Inject(SEED_CHAIN_REPOSITORY)
    private readonly repo: SeedChainRepository,
    @Inject(ENV) private readonly env: GamesEnv,
  ) {}

  /** Pega um candidato do buffer (LPOP). `null` em cache miss ou Valkey indisponível. */
  async takeCandidate(): Promise<ResolvedSeed | null> {
    const raw = await this.lpopSafe();
    return raw ? parseResolvedSeed(raw) : null;
  }

  /** Read-ahead: enche o buffer a partir do cursor atual, sem consumir (não move o cursor). */
  async refillIfLow(): Promise<void> {
    try {
      const len = await this.valkey.llen(BUFFER_KEY);
      if (len >= this.env.SEED_BUFFER_LOW_WATERMARK) {
        return;
      }
      const active = await this.repo.findActiveChain();
      // Só dá pra formar candidato com publicSeed resolvido.
      if (!active || active.publicSeed === null) {
        return;
      }
      const publicSeed = active.publicSeed;
      const want = this.env.SEED_BUFFER_SIZE - len;
      if (want <= 0) {
        return;
      }
      const rows = await this.repo.readSeeds(active.id, active.cursor + len, want);
      const payload = rows.map((r) =>
        JSON.stringify({
          chainId: active.id,
          index: r.index,
          serverSeed: r.serverSeed,
          serverSeedHash: r.serverSeedHash,
          publicSeed,
        } satisfies ResolvedSeed),
      );
      await this.valkey.rpush(BUFFER_KEY, payload);
    } catch (err) {
      // Read-ahead é best-effort: falha de Valkey/DB aqui só significa que o opener vai
      // consumir via cold storage. Não propaga (não derruba o loop).
      this.logger.warn(
        `Falha ao reabastecer o buffer (seguindo via cold storage): ${asMessage(err)}`,
      );
    }
  }

  /** Esvazia o buffer — usado na rotação de cadeia (candidatos da cadeia antiga ficam stale). */
  async clear(): Promise<void> {
    try {
      await this.valkey.del(BUFFER_KEY);
    } catch (err) {
      this.logger.warn(`Falha ao limpar o buffer na rotação: ${asMessage(err)}`);
    }
  }

  private async lpopSafe(): Promise<string | null> {
    try {
      return await this.valkey.lpop(BUFFER_KEY);
    } catch {
      return null;
    }
  }
}

function parseResolvedSeed(raw: string): ResolvedSeed | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const o = parsed as Record<string, unknown>;
    if (
      typeof o.chainId === "string" &&
      typeof o.index === "number" &&
      typeof o.serverSeed === "string" &&
      typeof o.serverSeedHash === "string" &&
      typeof o.publicSeed === "string"
    ) {
      return {
        chainId: o.chainId,
        index: o.index,
        serverSeed: o.serverSeed,
        serverSeedHash: o.serverSeedHash,
        publicSeed: o.publicSeed,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
