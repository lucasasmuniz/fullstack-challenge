/**
 * Valor monetário em centavos inteiros (`bigint`), imutável e não-negativo — sem ponto
 * flutuante. `subtract` lança se ficar negativo; o chamador checa antes com
 * `isGreaterThanOrEqual` (a regra "saldo insuficiente" vive no agregado). Sem moeda: o
 * contexto a guarda.
 */
export class Money {
  private constructor(private readonly cents: bigint) {}

  /** Cria a partir de centavos. Aceita `number` inteiro seguro por ergonomia. */
  static fromCents(value: bigint | number): Money {
    const cents = typeof value === "bigint" ? value : toSafeBigInt(value);
    if (cents < 0n) {
      throw new RangeError(`Money não pode ser negativo: ${cents.toString()}`);
    }
    return new Money(cents);
  }

  static zero(): Money {
    return new Money(0n);
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    const result = this.cents - other.cents;
    if (result < 0n) {
      throw new RangeError("Money.subtract resultaria em valor negativo");
    }
    return new Money(result);
  }

  /**
   * Aplica um multiplicador inteiro ×100 (`247` = `2.47x`) com `floor` a favor da casa.
   * Aritmética em `bigint` (divisão inteira trunca), sem float. Fonte única do payout do
   * cashout: `payout = floor(cents · mult / 100)`.
   */
  multipliedBy(multiplierX100: bigint | number): Money {
    const mult =
      typeof multiplierX100 === "bigint"
        ? multiplierX100
        : toSafeBigInt(multiplierX100);
    if (mult < 0n) {
      throw new RangeError(
        `Multiplicador não pode ser negativo: ${mult.toString()}`,
      );
    }
    return new Money((this.cents * mult) / 100n);
  }

  isGreaterThanOrEqual(other: Money): boolean {
    return this.cents >= other.cents;
  }

  isLessThan(other: Money): boolean {
    return this.cents < other.cents;
  }

  isZero(): boolean {
    return this.cents === 0n;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  compare(other: Money): number {
    if (this.cents < other.cents) return -1;
    if (this.cents > other.cents) return 1;
    return 0;
  }

  toCents(): bigint {
    return this.cents;
  }

  toString(): string {
    return this.cents.toString();
  }
}

function toSafeBigInt(value: number): bigint {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Money exige centavos inteiros, recebeu: ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Valor fora do safe-integer: ${value}`);
  }
  return BigInt(value);
}
