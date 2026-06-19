import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { loadEnv } from "../src/index";

const schema = z.object({
  PORT: z.coerce.number().int().positive(),
  NAME: z.string().min(1),
});

describe("loadEnv", () => {
  it("valida e devolve o objeto tipado (com coerção)", () => {
    const env = loadEnv(schema, { PORT: "4001", NAME: "games" });

    expect(env).toEqual({ PORT: 4001, NAME: "games" });
  });

  it("lança fail-fast quando falta uma variável", () => {
    expect(() => loadEnv(schema, { PORT: "4001" })).toThrow(/NAME/);
  });

  it("lança quando o valor é inválido", () => {
    expect(() =>
      loadEnv(schema, { PORT: "not-a-number", NAME: "games" }),
    ).toThrow(/PORT/);
  });
});
