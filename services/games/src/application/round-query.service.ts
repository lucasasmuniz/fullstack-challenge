import { Inject, Injectable } from "@nestjs/common";
import { ENV } from "@crash-game/nestjs-kit";
import {
  ProvablyFairDomainService,
  Round,
  RoundStatus,
  type ProvablyFairPolicy,
  type ProvablyFairVerification,
} from "../domain";
import type { GamesEnv } from "../infrastructure/config/env.schema";
import { ROUND_REPOSITORY, type RoundRepository } from "./round.repository";

export interface RoundVerification {
  round: Round;
  verification: ProvablyFairVerification;
  /**
   * Elo da cadeia com a rodada anterior. `null` se não há rodada anterior revelada.
   * `crossChainBoundary` distingue um `ok:false` **honesto** (a anterior é de outra
   * cadeia — rotação) de uma real divergência: na fronteira de rotação não há elo a
   * verificar, então `ok` vem `true` e `crossChainBoundary` `true`.
   */
  chainLink: {
    ok: boolean;
    priorRoundNumber: number;
    crossChainBoundary: boolean;
  } | null;
}

/** Leituras de rodada (lado de query do CQRS) + verificação provably fair. */
@Injectable()
export class RoundQueryService {
  private readonly policy: ProvablyFairPolicy;

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly rounds: RoundRepository,
    private readonly provablyFair: ProvablyFairDomainService,
    @Inject(ENV) private readonly env: GamesEnv,
  ) {
    this.policy = {
      instantBustDivisor: BigInt(env.PROVABLY_FAIR_INSTANT_BUST_DIVISOR),
      maxCrashX100: BigInt(env.PROVABLY_FAIR_MAX_CRASH_X100),
    };
  }

  getCurrent(): Promise<Round | null> {
    return this.rounds.findCurrent();
  }

  getHistory(limit: number, offset: number): Promise<Round[]> {
    return this.rounds.findHistory(limit, offset);
  }

  /**
   * Verifica uma rodada passada: recomputa commitment + crash point e (se houver) o elo
   * da cadeia com a rodada anterior. Retorna `null` se a rodada não existe ou ainda não
   * revelou a seed (não terminou) — o controller traduz para 404.
   */
  async verify(id: string): Promise<RoundVerification | null> {
    const round = await this.rounds.findById(id);
    if (!round || !isRevealed(round)) {
      return null;
    }
    const serverSeed = round.getServerSeed();
    const verification = this.provablyFair.verify({
      serverSeed,
      serverSeedHash: round.serverSeedHash,
      publicSeed: round.publicSeed,
      crashPointX100: round.crashPointX100,
      policy: this.policy,
    });

    const prev = await this.rounds.findPreviousByRoundNumber(round.roundNumber);
    let chainLink: RoundVerification["chainLink"] = null;
    if (prev && isRevealed(prev)) {
      const crossChainBoundary = prev.chainId !== round.chainId;
      chainLink = {
        // chain[i-1] = sha256(chain[i]) → sha256(seed_R) == seed_{R-1} (revelado). Só vale
        // dentro da MESMA cadeia; na fronteira de rotação não há elo (ok=true, boundary=true).
        ok: crossChainBoundary
          ? true
          : this.provablyFair.verifyChainLink(serverSeed, prev.getServerSeed()),
        priorRoundNumber: prev.roundNumber,
        crossChainBoundary,
      };
    }

    return { round, verification, chainLink };
  }
}

function isRevealed(round: Round): boolean {
  return (
    round.status === RoundStatus.CRASHED || round.status === RoundStatus.SETTLED
  );
}
