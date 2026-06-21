import { test, expect } from "@playwright/test";

/**
 * E2E de espectador (anônimo) — sem login, exercita o tempo real e o gate de aposta. Exige a stack
 * de pé (Kong/games). O fluxo autenticado depende do redirect do Keycloak e não é coberto aqui.
 */

test("landing mostra o hero e os CTAs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /saiba sacar a tempo/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar conta" })).toBeVisible();
});

test("lobby só tem o Crash ativo", async ({ page }) => {
  await page.goto("/lobby");
  await expect(page.getByText("Crash · Avião")).toBeVisible();
  await expect(page.getByText("em breve").first()).toBeVisible();
});

test("jogo: multiplicador em tempo real e painel bloqueado para visitante", async ({ page }) => {
  await page.goto("/game");

  // O multiplicador (×100) aparece e evolui ao longo das fases (WS + dead reckoning).
  const multiplier = page.locator("text=/\\d+\\.\\d{2}x/").first();
  await expect(multiplier).toBeVisible({ timeout: 15_000 });

  // Visitante não aposta: overlay com o CTA de criar conta cobre o painel.
  await expect(page.getByText("Entre para apostar")).toBeVisible();
  await expect(page.getByText(/crie conta/i)).toBeVisible();
});
