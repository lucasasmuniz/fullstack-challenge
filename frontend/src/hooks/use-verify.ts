import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface VerifyDto {
  readonly id: string;
  readonly roundNumber: number;
  readonly crashPointX100: number;
  readonly serverSeed: string;
  readonly serverSeedHash: string;
  readonly publicSeed: string;
  readonly verification: {
    readonly commitmentOk: boolean;
    readonly crashPointOk: boolean;
    readonly isValid: boolean;
    readonly recomputedCrashPointX100: number;
    readonly recomputedServerSeedHash: string;
  };
  readonly chainLink: {
    readonly ok: boolean;
    readonly priorRoundNumber: number;
    readonly crossChainBoundary: boolean;
  } | null;
}

/** Dados de verificação provably-fair de uma rodada passada (público). */
export function useVerify(roundId: string) {
  return useQuery({
    queryKey: ["verify", roundId],
    queryFn: () => apiFetch<VerifyDto>(`/games/rounds/${roundId}/verify`),
  });
}
