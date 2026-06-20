import type { Round } from "../domain";

/**
 * Conflito de concorrência ao salvar a rodada (a `version` no banco não bate com a
 * esperada). É o **fencing** do scheduler: um líder obsoleto que tente persistir uma
 * transição com `version` defasada cai aqui — o estado **não** é corrompido. O scheduler
 * trata como "perdi a liderança" e faz step-down. Não é erro de HTTP.
 */
export class RoundConcurrencyError extends Error {
  constructor(roundId: string) {
    super(`Conflito de concorrência ao salvar a rodada ${roundId} (version desatualizada).`);
    this.name = "RoundConcurrencyError";
  }
}

/**
 * Port do repositório do `Round` (state-stored). Escritas com **UPDATE condicional por
 * `version`** (concorrência otimista); leituras hidratam o agregado via `reconstitute`.
 */
export interface RoundRepository {
  /** Atualiza condicionalmente por `version`; lança `RoundConcurrencyError` se não bater. */
  save(round: Round): Promise<void>;
  /** Rodada corrente (`BETTING`|`RUNNING`), se houver. */
  findCurrent(): Promise<Round | null>;
  findById(id: string): Promise<Round | null>;
  /** Histórico (`CRASHED`|`SETTLED`), mais recentes primeiro. */
  findHistory(limit: number, offset: number): Promise<Round[]>;
  /** Rodada anterior (por `round_number - 1`) — para o elo da cadeia no verify. */
  findPreviousByRoundNumber(roundNumber: number): Promise<Round | null>;
}

export const ROUND_REPOSITORY = Symbol("ROUND_REPOSITORY");
