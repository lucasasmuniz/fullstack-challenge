/**
 * Estados da sessão de auto-bet (Process Manager). `ACTIVE` aposta a cada rodada; os
 * terminais distinguem **parada manual** (`STOPPED`) de **freio atingido** (`COMPLETED`,
 * com `completionReason`). Sem `PAUSED` (sem gatilho real no escopo — YAGNI).
 */
export enum AutoBetStatus {
  ACTIVE = "ACTIVE",
  STOPPED = "STOPPED",
  COMPLETED = "COMPLETED",
}
