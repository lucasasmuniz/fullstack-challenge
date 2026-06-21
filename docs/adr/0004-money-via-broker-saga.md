# ADR 0004 — Movimento de dinheiro via saga assíncrona (não REST síncrono)

**Status:** Aceito

## Contexto

A liquidação do jogo (débito da aposta, crédito do cashout) cruza dois serviços (Game e Wallet) com
bancos separados. Não há transação ACID distribuída viável. O README exige comunicação via broker.

## Decisão

Débito/crédito do jogo acontecem por **saga assíncrona** sobre SQS com **outbox/inbox**:
- Game grava intenção + evento na outbox **na mesma transação** do estado da aposta.
- Wallet consome (inbox dedup), aplica e publica o resultado; Game reage confirmando/rejeitando.
- Crash sem cashout ⇒ aposta `LOST`. Falhas ⇒ compensação (refund).

`POST /wallets/deposit` e `/withdraw` são uma **feature adicional intencional**, via **REST**, porque são
intra-contexto (a carteira no próprio dinheiro) e não liquidação cross-service. A regra do README
("crédito/débito não via REST") cobre o **débito da aposta e o crédito do cashout**, que só trafegam
pelo SQS. Deposit/withdraw deixam a app mais dinâmica (recarregar/sacar fora do jogo) sem ferir a regra;
seguem sendo eventos auditáveis do ledger (`reason=deposit|withdrawal`).

## Consequências

- (+) Resiliência (Wallet fora → mensagens na fila), sem 2PC frágil, absorve picos, auditável.
- (+) Exactly-once efetivo via outbox transacional + inbox idempotente.
- (−) Consistência eventual: aposta fica `PENDING_FUNDS` até confirmar. A janela de apostas (~10s)
  cobre o round-trip; só aposta `CONFIRMED` participa.
