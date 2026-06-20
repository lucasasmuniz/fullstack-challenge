import { describe, it, expect } from "bun:test";
import { multiplierAt, elapsedForMultiplier } from "../src/index";

const RATE = 0.1; // growth por segundo (valor de teste)

describe("curve", () => {
  describe("multiplierAt", () => {
    it("t=0 (ou negativo) → 1.00x (=100)", () => {
      expect(multiplierAt(0, RATE)).toBe(100);
      expect(multiplierAt(-50, RATE)).toBe(100);
    });

    it("vetores conhecidos (floor de 100·e^(gr·ms/1000))", () => {
      expect(multiplierAt(1000, RATE)).toBe(110);
      expect(multiplierAt(2000, RATE)).toBe(122);
    });

    it("é monotonicamente não-decrescente no tempo", () => {
      let prev = multiplierAt(0, RATE);
      for (let ms = 100; ms <= 10_000; ms += 100) {
        const cur = multiplierAt(ms, RATE);
        expect(cur).toBeGreaterThanOrEqual(prev);
        prev = cur;
      }
    });

    it("rejeita growthRate não-positivo", () => {
      expect(() => multiplierAt(1000, 0)).toThrow(RangeError);
      expect(() => multiplierAt(1000, -1)).toThrow(RangeError);
    });
  });

  describe("elapsedForMultiplier", () => {
    it("1.00x (=100) ou abaixo → 0ms", () => {
      expect(elapsedForMultiplier(100, RATE)).toBe(0);
      expect(elapsedForMultiplier(50, RATE)).toBe(0);
    });

    it("é a inversa de multiplierAt (round-trip, tolerância ±1)", () => {
      for (const target of [110, 150, 200, 500, 1000, 5000]) {
        const t = elapsedForMultiplier(target, RATE);
        // floor + arredondamento de transcendental → tolera 1 unidade ×100
        expect(Math.abs(multiplierAt(t, RATE) - target)).toBeLessThanOrEqual(1);
      }
    });

    it("rejeita growthRate não-positivo", () => {
      expect(() => elapsedForMultiplier(200, 0)).toThrow(RangeError);
    });
  });
});
