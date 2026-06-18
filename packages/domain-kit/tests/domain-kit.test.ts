import { describe, it, expect } from "bun:test";
import {
  Result,
  DomainError,
  DomainEvent,
  Entity,
  AggregateRoot,
  ValueObject,
} from "../src/index";

describe("Result", () => {
  it("ok carrega o valor", () => {
    const r = Result.ok<number>(42);
    expect(r.isOk).toBe(true);
    expect(r.isFail).toBe(false);
    expect(r.unwrap()).toBe(42);
  });

  it("fail carrega o erro", () => {
    const r = Result.fail<string>("boom");
    expect(r.isFail).toBe(true);
    expect(r.isOk).toBe(false);
    expect(r.unwrapError()).toBe("boom");
  });

  it("unwrap em falha lança", () => {
    const r = Result.fail<string, number>("boom");
    expect(() => r.unwrap()).toThrow();
  });

  it("unwrapError em sucesso lança", () => {
    const r = Result.ok<number>(1);
    expect(() => r.unwrapError()).toThrow();
  });

  it("map transforma o sucesso e propaga a falha", () => {
    expect(Result.ok<number>(2).map((n) => n * 10).unwrap()).toBe(20);
    const failed = Result.fail<string, number>("e").map((n) => n * 10);
    expect(failed.isFail).toBe(true);
    expect(failed.unwrapError()).toBe("e");
  });

  it("mapError transforma o erro e propaga o sucesso", () => {
    expect(Result.fail<string, number>("e").mapError((s) => s.length).unwrapError()).toBe(1);
    expect(Result.ok<number, string>(5).mapError((s) => s.length).unwrap()).toBe(5);
  });
});

describe("DomainError", () => {
  class InsufficientFundsError extends DomainError {
    readonly code = "INSUFFICIENT_FUNDS";
    constructor() {
      super("saldo insuficiente");
    }
  }

  it("é uma Error com code estável e name da subclasse", () => {
    const err = new InsufficientFundsError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe("INSUFFICIENT_FUNDS");
    expect(err.name).toBe("InsufficientFundsError");
    expect(err.message).toBe("saldo insuficiente");
  });
});

describe("DomainEvent", () => {
  class RoundStarted extends DomainEvent {
    readonly eventName = "round.started";
  }

  it("usa o occurredAt injetado (determinismo nos testes)", () => {
    const at = new Date("2026-01-01T00:00:00.000Z");
    expect(new RoundStarted(at).occurredAt).toEqual(at);
  });
});

describe("Entity", () => {
  class Player extends Entity<string> {
    constructor(id: string) {
      super(id);
    }
  }

  it("igualdade por id", () => {
    const a = new Player("p1");
    const b = new Player("p1");
    const c = new Player("p2");
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(a.equals(undefined)).toBe(false);
  });
});

describe("AggregateRoot", () => {
  class SampleEvent extends DomainEvent {
    readonly eventName = "sample";
  }
  class Round extends AggregateRoot<string> {
    constructor(id: string) {
      super(id);
    }
    start(): void {
      this.addEvent(new SampleEvent());
    }
  }

  it("acumula e drena domain events", () => {
    const round = new Round("r1");
    round.start();
    round.start();
    expect(round.domainEvents).toHaveLength(2);

    const pulled = round.pullEvents();
    expect(pulled).toHaveLength(2);
    expect(round.domainEvents).toHaveLength(0);
  });
});

describe("ValueObject", () => {
  interface MoneyProps {
    cents: number;
    currency: string;
  }
  class Money extends ValueObject<MoneyProps> {
    constructor(cents: number, currency: string) {
      super({ cents, currency });
    }
  }

  it("igualdade estrutural (por valor)", () => {
    expect(new Money(100, "BRL").equals(new Money(100, "BRL"))).toBe(true);
    expect(new Money(100, "BRL").equals(new Money(200, "BRL"))).toBe(false);
    expect(new Money(100, "BRL").equals(undefined)).toBe(false);
  });

  it("é imutável (props congeladas)", () => {
    const money = new Money(100, "BRL");
    expect(Object.isFrozen((money as unknown as { props: MoneyProps }).props)).toBe(true);
  });
});
