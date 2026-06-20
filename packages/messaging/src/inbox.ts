/**
 * Port da inbox (dedup de mensagens recebidas). Implementada por cada serviço com
 * MikroORM e usada **dentro da mesma transação** do write de domínio do handler — é isso
 * que dá exactly-once: ou (registro do messageId + efeito de domínio) commitam juntos, ou
 * nada. Uma reentrega do mesmo `messageId` encontra o registro e é ignorada (ack seco).
 *
 * `register` deve usar `INSERT ... ON CONFLICT DO NOTHING` e retornar:
 * - `true`  → inserido agora (primeira vez) → o handler aplica o efeito;
 * - `false` → já existia (reentrega) → o handler pula e o consumidor dá ack.
 */
export interface InboxStore {
  register(messageId: string, type: string): Promise<boolean>;
}
