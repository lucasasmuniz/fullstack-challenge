import { describe, it, expect } from "bun:test";
import { BadRequestException, type ArgumentsHost } from "@nestjs/common";
import { AllExceptionsFilter } from "../src/index";

interface Captured {
  statusCode?: number;
  body?: unknown;
}

function makeHost(captured: Captured): ArgumentsHost {
  const response = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
    },
  };
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe("AllExceptionsFilter", () => {
  it("preserva HttpException (status + corpo seguro do Nest)", () => {
    const captured: Captured = {};

    new AllExceptionsFilter().catch(
      new BadRequestException("bad input"),
      makeHost(captured),
    );

    expect(captured.statusCode).toBe(400);
    expect(captured.body).toMatchObject({ statusCode: 400, message: "bad input" });
  });

  it("erro inesperado vira 500 genérico, sem vazar a mensagem interna", () => {
    const captured: Captured = {};

    new AllExceptionsFilter().catch(
      new Error("DB password is hunter2"),
      makeHost(captured),
    );

    expect(captured.statusCode).toBe(500);
    expect(captured.body).toEqual({
      statusCode: 500,
      message: "Internal server error",
    });
    expect(JSON.stringify(captured.body)).not.toContain("hunter2");
  });
});
