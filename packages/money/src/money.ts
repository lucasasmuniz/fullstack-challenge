/**
 * Money — valor monetário em **centavos inteiros** (`bigint`), sem ponto flutuante
 * (ADR 0005). Imutável e não-negativo: um `Money` nunca representa dívida. Operações
 * que poderiam ficar negativas (`subtract`) lançam — o chamador deve checar antes
 * com `isGreaterThanOrEqual` (a regra de negócio "saldo insuficiente" vive no
 * agregado, que retorna `Result.fail`, não aqui).
 *
 * Sem `currency`: a moeda é responsabilidade do contexto (a Wallet a guarda).
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

  /** Subtrai; lança se o resultado for negativo (cheque `isGreaterThanOrEqual` antes). */
  subtract(other: Money): Money {
    const result = this.cents - other.cents;
    if (result < 0n) {
      throw new RangeError("Money.subtract resultaria em valor negativo");
    }
    return new Money(result);
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

  /** -1 | 0 | 1 (ordenação). */
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
