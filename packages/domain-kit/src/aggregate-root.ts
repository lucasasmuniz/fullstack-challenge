import { Entity } from "./entity";
import type { DomainEvent } from "./domain-event";

/**
 * AggregateRoot — raiz de consistência. Acumula domain events que são drenados
 * (`pullEvents`) após persistir, para então publicar (projeções, WebSocket, outbox).
 */
export abstract class AggregateRoot<TId> extends Entity<TId> {
  private _events: DomainEvent[] = [];

  protected addEvent(event: DomainEvent): void {
    this._events.push(event);
  }

  /** Retorna e limpa os eventos acumulados. */
  pullEvents(): DomainEvent[] {
    const events = this._events;
    this._events = [];
    return events;
  }

  get domainEvents(): readonly DomainEvent[] {
    return this._events;
  }
}
