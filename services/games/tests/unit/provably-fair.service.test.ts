import { describe, it, expect } from "bun:test";
import { createHmac } from "node:crypto";
import { ProvablyFairDomainService } from "../../src/domain/provably-fair.service";
import {
  DEFAULT_PROVABLY_FAIR_POLICY,
  type ProvablyFairPolicy,
} from "../../src/domain/provably-fair-policy";

const svc = new ProvablyFairDomainService();

// Recomputação INDEPENDENTE da fórmula (cópia própria no teste) — trava o serviço
// contra drift: mudar slice/constante/operador no src quebra esta comparação.
function expectedCrashX100(
  serverSeed: string,
  publicSeed: string,
  policy: ProvablyFairPolicy,
): number {
  const hmac = createHmac("sha256", serverSeed)
    .update(publicSeed, "utf8")
    .digest("hex");
  const h = BigInt(`0x${hmac.slice(0, 13)}`);
  if (h % policy.instantBustDivisor === 0n) return 100;
  const e = 2n ** 52n;
  const raw = (100n * e - h) / (e - h);
  const bounded = raw > policy.maxCrashX100 ? policy.maxCrashX100 : raw;
  return Number(bounded < 100n ? 100n : bounded);
}

describe("ProvablyFairDomainService", () => {
  describe("hashSeed", () => {
    it("bate com vetores SHA-256 conhecidos", () => {
      expect(svc.hashSeed("")).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(svc.hashSeed("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    });
  });

  describe("generateChain (cadeia reversa de Lamport)", () => {
    it("cada elo é o sha256 do próximo; S_0 é o root commitment", () => {
      const chain = svc.generateChain("base-seed-S_N", 5);
      expect(chain).toHaveLength(5);
      for (let i = 0; i < chain.length - 1; i++) {
        expect(chain[i]).toBe(svc.hashSeed(chain[i + 1]));
      }
      // a base fornecida é S_N (último índice)
      expect(chain[chain.length - 1]).toBe("base-seed-S_N");
    });

    it("length 1 devolve só a base; length inválido lança", () => {
      expect(svc.generateChain("x", 1)).toEqual(["x"]);
      expect(() => svc.generateChain("x", 0)).toThrow(RangeError);
      expect(() => svc.generateChain("x", 1.5)).toThrow(RangeError);
    });
  });

  describe("deriveCrashPoint", () => {
    const policy = DEFAULT_PROVABLY_FAIR_POLICY;

    it("é determinístico (mesma entrada → mesmo crash)", () => {
      const a = svc.deriveCrashPoint("seed-1", "public-1", policy);
      const b = svc.deriveCrashPoint("seed-1", "public-1", policy);
      expect(a).toBe(b);
    });

    it("bate com a fórmula documentada (vários vetores)", () => {
      for (const seed of ["seed-1", "seed-2", "abc", "ffff", "round-42"]) {
        const got = svc.deriveCrashPoint(seed, "public-salt", policy);
        expect(got).toBe(expectedCrashX100(seed, "public-salt", policy));
      }
    });

    it("nunca abaixo de 1.00x e respeita o teto (várias seeds)", () => {
      for (let i = 0; i < 200; i++) {
        const got = svc.deriveCrashPoint(`s-${i}`, "p", policy);
        expect(got).toBeGreaterThanOrEqual(100);
        expect(BigInt(got)).toBeLessThanOrEqual(policy.maxCrashX100);
        expect(Number.isInteger(got)).toBe(true);
      }
    });

    it("instantBustDivisor=1 → sempre instant bust em 1.00x (house edge total)", () => {
      const always: ProvablyFairPolicy = {
        instantBustDivisor: 1n,
        maxCrashX100: 1_000_000n,
      };
      for (const seed of ["a", "b", "c", "qualquer"]) {
        expect(svc.deriveCrashPoint(seed, "p", always)).toBe(100);
      }
    });

    it("aplica o teto (maxCrashX100) e o piso de 1.00x", () => {
      const capped: ProvablyFairPolicy = {
        instantBustDivisor: 2n ** 60n, // bust só se h===0 → ~nunca
        maxCrashX100: 100n, // teto = piso → tudo vira 100
      };
      for (const seed of ["x", "y", "z"]) {
        expect(svc.deriveCrashPoint(seed, "p", capped)).toBe(100);
      }
    });
  });

  describe("verify", () => {
    const policy = DEFAULT_PROVABLY_FAIR_POLICY;
    const serverSeed = "revealed-server-seed";
    const publicSeed = "public-salt";
    const serverSeedHash = svc.hashSeed(serverSeed);
    const crashPointX100 = svc.deriveCrashPoint(serverSeed, publicSeed, policy);

    it("aprova uma rodada íntegra", () => {
      const v = svc.verify({
        serverSeed,
        serverSeedHash,
        publicSeed,
        crashPointX100,
        policy,
      });
      expect(v.commitmentOk).toBe(true);
      expect(v.crashPointOk).toBe(true);
      expect(v.isValid).toBe(true);
    });

    it("reprova commitment adulterado", () => {
      const v = svc.verify({
        serverSeed,
        serverSeedHash: "deadbeef",
        publicSeed,
        crashPointX100,
        policy,
      });
      expect(v.commitmentOk).toBe(false);
      expect(v.isValid).toBe(false);
    });

    it("reprova crash point adulterado", () => {
      const v = svc.verify({
        serverSeed,
        serverSeedHash,
        publicSeed,
        crashPointX100: crashPointX100 + 1,
        policy,
      });
      expect(v.crashPointOk).toBe(false);
      expect(v.isValid).toBe(false);
    });
  });

  describe("verifyChainLink", () => {
    it("valida o elo com a rodada anterior e rejeita elo quebrado", () => {
      const chain = svc.generateChain("base", 4);
      // chain[i] === sha256(chain[i+1]) → revelar chain[i+1] prova o commitment chain[i]
      for (let i = 0; i < chain.length - 1; i++) {
        expect(svc.verifyChainLink(chain[i + 1], chain[i])).toBe(true);
      }
      expect(svc.verifyChainLink("seed-falsa", chain[0])).toBe(false);
    });
  });
});
