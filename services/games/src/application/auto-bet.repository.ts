import type { AutoBetSession } from "../domain";

/**
 * Conflito de concorrência otimista ao salvar a sessão (a `version` no banco não bate).
 * Acontece na corrida REST-stop × reconcile-do-líder. O caller (runner) loga e segue; o
 * REST devolve 409.
 */
export class AutoBetConcurrencyError extends Error {
  constructor(sessionId: string) {
    super(`Conflito de concorrência ao salvar a sessão ${sessionId} (version desatualizada).`);
    this.name = "AutoBetConcurrencyError";
  }
}

/**
 * Port do repositório da `AutoBetSession` (state-stored, fencing por `version`).
 *
 * - `insert`: cria a sessão nova; `UNIQUE` parcial (`player_id` onde `ACTIVE`) impede duas
 *   sessões ativas por jogador → `AutoBetAlreadyActiveError` na camada de aplicação.
 * - `save`: UPDATE fenced por `version` (1 linha = ok; 0 = `AutoBetConcurrencyError`).
 * - `findActive`: todas as sessões `ACTIVE` (varredura do líder a cada round).
 * - `findActiveByPlayer`: a sessão `ACTIVE` do jogador (REST: GET /me, guard de duplicidade).
 */
export interface AutoBetRepository {
  insert(session: AutoBetSession): Promise<void>;
  save(session: AutoBetSession): Promise<void>;
  findActive(): Promise<AutoBetSession[]>;
  findActiveByPlayer(playerId: string): Promise<AutoBetSession | null>;
  /** A sessão **mais recente** do jogador (qualquer status) — REST GET /me mostra o resultado. */
  findLatestByPlayer(playerId: string): Promise<AutoBetSession | null>;
}

export const AUTO_BET_REPOSITORY = Symbol("AUTO_BET_REPOSITORY");
