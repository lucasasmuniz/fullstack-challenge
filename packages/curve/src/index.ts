// TODO(Etapa 4): curva determinística do crash (multiplierAt / elapsedForMultiplier),
// consumida pelo Game (autoridade do crash) e pelo frontend (animação entre ticks).
//
// GUARDRAIL (ADR 0007): este pacote só pode conter math pura da curva.
// Seed, crash point e qualquer autoridade do jogo são server-only — NUNCA entram aqui.
export {};
