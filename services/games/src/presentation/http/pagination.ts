/** Paginação por `limit`/`offset` das rotas de leitura. Antes duplicada em dois controllers. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** Faz parse + clamp de um inteiro de query string; `undefined`/inválido → `fallback`. */
function clampInt(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

/** `limit` em `[1, MAX_LIMIT]` (default 20); `offset` ≥ 0 (default 0). */
export function parsePagination(
  limit?: string,
  offset?: string,
): { limit: number; offset: number } {
  return {
    limit: clampInt(limit, 1, MAX_LIMIT, DEFAULT_LIMIT),
    offset: clampInt(offset, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}
