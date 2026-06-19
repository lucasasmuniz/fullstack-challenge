import { describe, it, expect } from "bun:test";
import { Money } from "../src/index";

describe("Money", () => {
  it("cria a partir de bigint e number inteiro", () => {
    expect(Money.fromCents(100n).toCents()).toBe(100n);
    expect(Money.fromCents(100).toCents()).toBe(100n);
    expect(Money.zero().toCents()).toBe(0n);
  });

  it("rejeita construção negativa", () => {
    expect(() => Money.fromCents(-1n)).toThrow(RangeError);
    expect(() => Money.fromCents(-1)).toThrow(RangeError);
  });

  it("rejeita number não-inteiro ou fora do safe-integer", () => {
    expect(() => Money.fromCents(1.5)).toThrow(RangeError);
    expect(() => Money.fromCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      RangeError,
    );
  });

  it("add soma centavos", () => {
    expect(Money.fromCents(100n).add(Money.fromCents(50n)).toCents()).toBe(150n);
  });

  it("subtract subtrai e lança se ficar negativo", () => {
    expect(Money.fromCents(100n).subtract(Money.fromCents(40n)).toCents()).toBe(
      60n,
    );
    expect(() => Money.fromCents(40n).subtract(Money.fromCents(100n))).toThrow(
      RangeError,
    );
  });

  it("comparações", () => {
    const a = Money.fromCents(100n);
    const b = Money.fromCents(100n);
    const c = Money.fromCents(250n);
    expect(a.equals(b)).toBe(true);
    expect(a.isGreaterThanOrEqual(b)).toBe(true);
    expect(a.isGreaterThanOrEqual(c)).toBe(false);
    expect(a.isLessThan(c)).toBe(true);
    expect(a.compare(c)).toBe(-1);
    expect(c.compare(a)).toBe(1);
    expect(a.compare(b)).toBe(0);
    expect(Money.zero().isZero()).toBe(true);
  });

  it("mantém precisão com valores grandes (sem float)", () => {
    // 90 trilhões de centavos — muito além do safe-integer de number.
    const big = 90_000_000_000_000_00n;
    const result = Money.fromCents(big).add(Money.fromCents(1n));
    expect(result.toCents()).toBe(big + 1n);
  });

  it("imutabilidade: operações retornam nova instância", () => {
    const a = Money.fromCents(100n);
    const b = a.add(Money.fromCents(1n));
    expect(a.toCents()).toBe(100n);
    expect(b.toCents()).toBe(101n);
  });
});
