import { env } from "./env";
import { getUserManager } from "./auth";

/** Erro de resposta REST com status + corpo, p/ mapear toasts (saldo insuficiente, 409, etc.). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === "string") return m;
    if (Array.isArray(m) && typeof m[0] === "string") return m[0];
  }
  return fallback;
}

/**
 * Fetch tipado contra o Kong. Anexa `Authorization: Bearer` do usuário OIDC quando logado.
 * Client-only (usa o UserManager). `init.body` deve ser string JSON (defina o Content-Type aqui).
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const user = await getUserManager().getUser();
  if (user?.access_token) {
    headers.set("Authorization", `Bearer ${user.access_token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${env.apiUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    throw new ApiError(res.status, messageOf(body, res.statusText), body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
