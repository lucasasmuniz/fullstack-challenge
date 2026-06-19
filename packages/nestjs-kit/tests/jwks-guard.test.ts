import "reflect-metadata";
import { describe, it, expect } from "bun:test";
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  JwksGuard,
  IS_PUBLIC_KEY,
  type AuthenticatedUser,
  type JwtVerifier,
} from "../src/index";

const VALID_USER: AuthenticatedUser = { sub: "player-uuid", username: "player" };

/**
 * Assere que a Promise rejeita (opcionalmente do tipo/mensagem esperados).
 * Awaita a Promise real (não o matcher `.rejects`, que o bun-types tipa como
 * não-thenable) — assim o `await-thenable` do eslint fica feliz.
 */
async function expectRejection(
  promise: Promise<unknown>,
  opts: { instanceOf?: new (...args: never[]) => Error; messageIncludes?: string } = {},
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (opts.instanceOf !== undefined) {
      expect(error).toBeInstanceOf(opts.instanceOf);
    }
    if (opts.messageIncludes !== undefined) {
      expect(String(error)).toContain(opts.messageIncludes);
    }
    return;
  }
  throw new Error("Expected promise to reject, but it resolved");
}

/** Verifier fake: aceita só o token "good"; conta as chamadas. */
class FakeVerifier implements JwtVerifier {
  calls = 0;
  verify(token: string): Promise<AuthenticatedUser> {
    this.calls += 1;
    if (token === "good") {
      return Promise.resolve(VALID_USER);
    }
    return Promise.reject(new Error("invalid"));
  }
}

interface ContextOptions {
  authorization?: string;
  isPublic?: boolean;
}

function makeContext(opts: ContextOptions): {
  context: ExecutionContext;
  request: { headers: Record<string, unknown>; user?: AuthenticatedUser };
} {
  const handler = function handler(): void {};
  if (opts.isPublic) {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  }
  const request: { headers: Record<string, unknown>; user?: AuthenticatedUser } =
    {
      headers:
        opts.authorization === undefined
          ? {}
          : { authorization: opts.authorization },
    };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class Dummy {},
  } as unknown as ExecutionContext;
  return { context, request };
}

function makeGuard(verifier: JwtVerifier): JwksGuard {
  return new JwksGuard(new Reflector(), verifier);
}

describe("JwksGuard", () => {
  it("libera rota @Public sem chamar o verifier", async () => {
    const verifier = new FakeVerifier();
    const { context } = makeContext({ isPublic: true });

    expect(await makeGuard(verifier).canActivate(context)).toBe(true);
    expect(verifier.calls).toBe(0);
  });

  it("rejeita 401 quando falta o Bearer token", async () => {
    const verifier = new FakeVerifier();
    const { context } = makeContext({});

    await expectRejection(makeGuard(verifier).canActivate(context), {
      instanceOf: UnauthorizedException,
    });
    expect(verifier.calls).toBe(0);
  });

  it("rejeita 401 com token inválido", async () => {
    const verifier = new FakeVerifier();
    const { context, request } = makeContext({ authorization: "Bearer bad" });

    await expectRejection(makeGuard(verifier).canActivate(context), {
      instanceOf: UnauthorizedException,
    });
    expect(request.user).toBeUndefined();
  });

  it("aceita token válido e popula req.user", async () => {
    const verifier = new FakeVerifier();
    const { context, request } = makeContext({ authorization: "Bearer good" });

    expect(await makeGuard(verifier).canActivate(context)).toBe(true);
    expect(request.user).toEqual(VALID_USER);
  });

  it("ignora esquema que não seja Bearer", async () => {
    const verifier = new FakeVerifier();
    const { context } = makeContext({ authorization: "Basic good" });

    await expectRejection(makeGuard(verifier).canActivate(context), {
      instanceOf: UnauthorizedException,
    });
    expect(verifier.calls).toBe(0);
  });
});
