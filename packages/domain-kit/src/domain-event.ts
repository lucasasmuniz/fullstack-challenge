/**
 * Base de domain events (in-process). Alimentam projeções e WebSocket.
 * `occurredAt` é injetável para manter os testes determinísticos (sem relógio real).
 */
export abstract class DomainEvent {
  abstract readonly eventName: string;
  readonly occurredAt: Date;

  constructor(occurredAt: Date = new Date()) {
    this.occurredAt = occurredAt;
  }
}
