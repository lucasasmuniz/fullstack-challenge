/**
 * Port da inbox (dedup de mensagens). Usada dentro da mesma tx do write de domínio do handler —
 * é o que dá exactly-once: o registro do `messageId` e o efeito de domínio commitam juntos ou nada.
 * `register` faz `INSERT ... ON CONFLICT DO NOTHING` e retorna `true` se inseriu agora (aplica o
 * efeito) ou `false` se já existia (reentrega → ack seco).
 */
export interface InboxStore {
  register(messageId: string, type: string): Promise<boolean>;
}
