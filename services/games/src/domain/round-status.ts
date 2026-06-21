/**
 * Ciclo de vida da rodada. Transições válidas (e somente elas, em ordem):
 * `BETTING → RUNNING → CRASHED → SETTLED`.
 */
export const RoundStatus = {
  BETTING: "BETTING",
  RUNNING: "RUNNING",
  CRASHED: "CRASHED",
  SETTLED: "SETTLED",
} as const;

export type RoundStatus = (typeof RoundStatus)[keyof typeof RoundStatus];
