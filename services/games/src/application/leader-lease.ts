import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ENV } from "@crash-game/nestjs-kit";
import type { GamesEnv } from "../infrastructure/config/env.schema";
import { VALKEY, type ValkeyPort } from "./valkey.port";

const LEASE_KEY = "scheduler:leader";

/**
 * Lease de líder no Valkey — garante **um** runner do `RoundScheduler` (ADR 0015). O
 * `token` é único por processo; renovar/soltar são escopados por dono (Lua). É só uma
 * otimização (evitar trabalho duplicado): a **correção** vem do fencing por `Round.version`
 * no save — um líder obsoleto falha o UPDATE condicional.
 */
@Injectable()
export class LeaderLease {
  // Token por **epoch de liderança**: um novo a cada `acquire()`. Assim um renew atrasado
  // de uma liderança anterior não renova por engano a atual (m4 do review).
  private token = randomUUID();

  constructor(
    @Inject(VALKEY) private readonly valkey: ValkeyPort,
    @Inject(ENV) private readonly env: GamesEnv,
  ) {}

  /** Tenta adquirir a liderança (SET NX PX) com um token novo. */
  async acquire(): Promise<boolean> {
    const token = randomUUID();
    const ok = await this.valkey.setNxPx(
      LEASE_KEY,
      token,
      this.env.SCHEDULER_LEASE_TTL_MS,
    );
    if (ok) {
      this.token = token;
    }
    return ok;
  }

  /** Renova o lease; `false` ⇒ perdemos a liderança (gatilho de step-down). */
  renew(): Promise<boolean> {
    return this.valkey.renewIfOwner(
      LEASE_KEY,
      this.token,
      this.env.SCHEDULER_LEASE_TTL_MS,
    );
  }

  /** Solta o lease (no shutdown) só se ainda formos o dono. */
  release(): Promise<void> {
    return this.valkey.releaseIfOwner(LEASE_KEY, this.token);
  }
}
