# ADR 0014 — Cashout server-authoritative + anti dupla-liquidação

**Status:** Aceito (domínio na Etapa 3; fluxo na Etapa 5/6)

## Contexto

No cashout o cliente é um ator com **incentivo financeiro direto para mentir**. Há a tentação de
"latency compensation": pagar no multiplicador que o cliente afirma ter clicado (`client_multiplier`),
dentro de uma tolerância de RTT. Também há o risco do **cliente em pânico** clicando "Cash Out" várias
vezes, que não pode gerar múltiplas liquidações da mesma aposta.

## Decisão

- **Server-authoritative:** o payout usa o multiplicador **autoritativo do servidor** no momento do
  processamento, não o valor enviado pelo cliente. Alinhado ao README ("o servidor é a autoridade do
  crash"). O lag-comp com delta tolerance fica **documentado como enhancement avançado** (exigiria
  tolerância baseada em posição+timestamp rastreados pelo servidor por conexão; risco residual).
- **Anti dupla-liquidação em duas camadas:**
  1. **Máquina de estados (domínio):** `Bet.cashout()` só sai de `CONFIRMED`. O 2º clique encontra estado
     terminal → `BetNotCashableError`. Nunca uma segunda liquidação.
  2. **Optimistic locking (persistência, Etapa 5):** a `Bet` carrega `version`; requests concorrentes que
     leem `CONFIRMED` ao mesmo tempo são resolvidos no commit (o 2º falha por conflito de version).
- **Semântica do erro:** `BetNotCashableError` é **transição inválida (HTTP 409)**, não 5xx — a aplicação
  distingue requisição **redundante** (silenciável na UI) de erro crítico de sistema.
- **Anti parameter-tampering:** `Bet.cashout(multiplierX100, crashPointX100, ...)` — na Etapa 5 o
  `crashPointX100` vem **sempre do estado confiável do `Round`**, nunca do payload do cliente. O domínio é
  agnóstico à origem do multiplicador; a aplicação garante a procedência.

## Consequências

- (+) Cashout inexplorável por padrão; dupla liquidação impossível (estado + version).
- (+) Erros com semântica clara → UX correta (clique redundante ≠ erro).
- (−) Jogador com latência alta precisa de margem (sem lag-comp no baseline) — aceito e documentado.
- (−) A aplicação (Etapa 5/6) é responsável por nunca passar crash point/multiplicador vindos do cliente.
