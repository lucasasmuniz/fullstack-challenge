import type { Round } from "../../domain";
import type { RoundVerification } from "../../application/round-query.service";

/**
 * Rodada **corrente** — exposição segura: **sem** `crashPointX100` e **sem** `serverSeed`
 * (revelá-los antes do crash entregaria o resultado). O cliente computa o multiplicador
 * pela curva a partir de `startedAt` + `growthRate`.
 */
export interface CurrentRoundDto {
  id: string;
  roundNumber: number;
  status: string;
  serverSeedHash: string;
  publicSeed: string;
  bettingEndsAt: string;
  startedAt: string | null;
  growthRate: number;
}

export function toCurrentRoundDto(
  round: Round,
  growthRate: number,
): CurrentRoundDto {
  return {
    id: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    serverSeedHash: round.serverSeedHash,
    publicSeed: round.publicSeed,
    bettingEndsAt: round.bettingEndsAt.toISOString(),
    startedAt: round.startedAt ? round.startedAt.toISOString() : null,
    growthRate,
  };
}

/** Rodada do histórico (já crashou) — inclui os dados de verificação revelados. */
export interface HistoryRoundDto {
  id: string;
  roundNumber: number;
  status: string;
  crashPointX100: number;
  serverSeed: string;
  serverSeedHash: string;
  publicSeed: string;
  crashedAt: string | null;
}

export function toHistoryRoundDto(round: Round): HistoryRoundDto {
  return {
    id: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    crashPointX100: round.crashPointX100,
    serverSeed: round.getServerSeed(),
    serverSeedHash: round.serverSeedHash,
    publicSeed: round.publicSeed,
    crashedAt: round.crashedAt ? round.crashedAt.toISOString() : null,
  };
}

/** Dados de verificação provably fair de uma rodada passada. */
export interface VerifyRoundDto {
  id: string;
  roundNumber: number;
  crashPointX100: number;
  serverSeed: string;
  serverSeedHash: string;
  publicSeed: string;
  verification: {
    commitmentOk: boolean;
    crashPointOk: boolean;
    isValid: boolean;
    recomputedCrashPointX100: number;
    recomputedServerSeedHash: string;
  };
  chainLink: {
    ok: boolean;
    priorRoundNumber: number;
    crossChainBoundary: boolean;
  } | null;
}

export function toVerifyRoundDto(result: RoundVerification): VerifyRoundDto {
  const { round, verification, chainLink } = result;
  return {
    id: round.id,
    roundNumber: round.roundNumber,
    crashPointX100: round.crashPointX100,
    serverSeed: round.getServerSeed(),
    serverSeedHash: round.serverSeedHash,
    publicSeed: round.publicSeed,
    verification: {
      commitmentOk: verification.commitmentOk,
      crashPointOk: verification.crashPointOk,
      isValid: verification.isValid,
      recomputedCrashPointX100: verification.recomputedCrashPointX100,
      recomputedServerSeedHash: verification.recomputedServerSeedHash,
    },
    chainLink,
  };
}
