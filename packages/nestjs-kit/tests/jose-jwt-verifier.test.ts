import { describe, it, expect } from "bun:test";
import { SignJWT, generateKeyPair } from "jose";
import { JoseJwtVerifier } from "../src/index";

const ISSUER = "http://localhost:8080/realms/crash-game";
const CLIENT = "crash-game-client";
const CHECKS = { authorizedParty: CLIENT, expectedTokenType: "Bearer" };

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

function rsaKeys(): Promise<KeyPair> {
  return generateKeyPair("RS256");
}

function token(
  privateKey: KeyPair["privateKey"],
  claims: Record<string, unknown>,
  opts: { issuer?: string; subject?: string; expSeconds?: number } = {},
): Promise<string> {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(opts.issuer ?? ISSUER)
    .setIssuedAt();
  if (opts.subject !== undefined) {
    jwt.setSubject(opts.subject);
  }
  jwt.setExpirationTime(opts.expSeconds ?? "1h");
  return jwt.sign(privateKey);
}

/** Awaita a Promise real (não o matcher `.rejects`, tipado como não-thenable). */
async function expectRejection(
  promise: Promise<unknown>,
  messageIncludes?: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (messageIncludes !== undefined) {
      expect(String(error)).toContain(messageIncludes);
    }
    return;
  }
  throw new Error("Expected promise to reject, but it resolved");
}

describe("JoseJwtVerifier (sem checagens extras)", () => {
  it("aceita token válido e extrai sub + preferred_username", async () => {
    const { publicKey, privateKey } = await rsaKeys();
    const jwt = await token(
      privateKey,
      { preferred_username: "player" },
      { subject: "player-uuid" },
    );

    const user = await new JoseJwtVerifier(publicKey, ISSUER).verify(jwt);

    expect(user).toEqual({ sub: "player-uuid", username: "player" });
  });

  it("sem preferred_username, username cai para o sub", async () => {
    const { publicKey, privateKey } = await rsaKeys();
    const jwt = await token(privateKey, {}, { subject: "p1" });

    const user = await new JoseJwtVerifier(publicKey, ISSUER).verify(jwt);

    expect(user).toEqual({ sub: "p1", username: "p1" });
  });

  it("rejeita issuer divergente", async () => {
    const { publicKey, privateKey } = await rsaKeys();
    const jwt = await token(
      privateKey,
      {},
      { subject: "p1", issuer: "http://evil/realms/x" },
    );

    await expectRejection(new JoseJwtVerifier(publicKey, ISSUER).verify(jwt));
  });

  it("rejeita token expirado", async () => {
    const { publicKey, privateKey } = await rsaKeys();
    const jwt = await token(
      privateKey,
      {},
      { subject: "p1", expSeconds: Math.floor(Date.now() / 1000) - 60 },
    );

    await expectRejection(new JoseJwtVerifier(publicKey, ISSUER).verify(jwt));
  });

  it("rejeita token sem claim sub", async () => {
    const { publicKey, privateKey } = await rsaKeys();
    const jwt = await token(privateKey, {});

    await expectRejection(
      new JoseJwtVerifier(publicKey, ISSUER).verify(jwt),
      "sub",
    );
  });

  it("rejeita assinatura de outra chave (RSA diferente)", async () => {
    const { privateKey } = await rsaKeys();
    const { publicKey: otherPublic } = await rsaKeys();
    const jwt = await token(privateKey, {}, { subject: "p1" });

    await expectRejection(
      new JoseJwtVerifier(otherPublic, ISSUER).verify(jwt),
    );
  });

  it("rejeita troca de algoritmo (HS256 não é aceito)", async () => {
    const { publicKey } = await rsaKeys();
    const hsToken = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setSubject("p1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-shared-secret-that-should-not-work"));

    await expectRejection(
      new JoseJwtVerifier(publicKey, ISSUER).verify(hsToken),
    );
  });
});

describe("JoseJwtVerifier (typ + azp — endurecimentos F1/F2)", () => {
  it("aceita access token (typ=Bearer) do cliente certo (azp)", async () => {
    const { publicKey, privateKey } = await rsaKeys();
    const jwt = await token(
      privateKey,
      { typ: "Bearer", azp: CLIENT, preferred_username: "player" },
      { subject: "player-uuid" },
    );

    const user = await new JoseJwtVerifier(publicKey, ISSUER, CHECKS).verify(
      jwt,
    );

    expect(user).toEqual({ sub: "player-uuid", username: "player" });
  });

  it("rejeita id_token (typ=ID) apresentado como access token", async () => {
    const { publicKey, privateKey } = await rsaKeys();
    const jwt = await token(
      privateKey,
      { typ: "ID", azp: CLIENT },
      { subject: "player-uuid" },
    );

    await expectRejection(
      new JoseJwtVerifier(publicKey, ISSUER, CHECKS).verify(jwt),
      "token type",
    );
  });

  it("rejeita token de outro cliente (azp divergente)", async () => {
    const { publicKey, privateKey } = await rsaKeys();
    const jwt = await token(
      privateKey,
      { typ: "Bearer", azp: "another-client" },
      { subject: "player-uuid" },
    );

    await expectRejection(
      new JoseJwtVerifier(publicKey, ISSUER, CHECKS).verify(jwt),
      "authorized party",
    );
  });
});
