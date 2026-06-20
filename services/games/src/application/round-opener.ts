import type { Round } from "../domain";
import type { ResolvedSeed } from "./seed-chain.repository";

/**
 * Resultado da tentativa de abrir uma rodada **atomicamente** (consumo da seed + insert
 * da rodada na mesma transação — M1). Evita seed órfã (consumida sem rodada) que quebraria
 * o elo da cadeia no `verify`.
 */
export type OpenRoundResult =
  | { kind: "opened"; round: Round }
  | { kind: "stale" } // candidato do buffer não bate com o cursor → tentar cold
  | { kind: "exhausted" } // cadeia ativa esgotada → rotacionar
  | { kind: "noChain" }; // sem cadeia ativa / publicSeed não resolvido → ensure

/**
 * Abre a próxima rodada numa única transação: trava a cadeia ativa, deriva o crash point
 * da seed (do `cursor`, ou confirma o candidato do buffer), avança o cursor + marca a seed
 * consumida, e insere a rodada (`round_number` via sequence). Tudo-ou-nada: se o insert
 * falhar, o cursor **não** avança (sem seed órfã).
 */
export interface RoundOpener {
  open(bufferedCandidate: ResolvedSeed | null): Promise<OpenRoundResult>;
}

export const ROUND_OPENER = Symbol("ROUND_OPENER");
