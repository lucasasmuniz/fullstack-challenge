/**
 * Ciclo de vida da rodada. Transições válidas (e somente elas, em ordem):
 * `BETTING → RUNNING → CRASHED → SETTLED`.
 *
 * Objeto `const` (não enum TS) para permitir `RoundStatus.CRASHED` e, ao mesmo
 * tempo, um tipo união estreito — consistente com o estilo do projeto.
 */
export const RoundStatus = {
  BETTING: "BETTING",
  RUNNING: "RUNNING",
  CRASHED: "CRASHED",
  SETTLED: "SETTLED",
} as const;

export type RoundStatus = (typeof RoundStatus)[keyof typeof RoundStatus];
