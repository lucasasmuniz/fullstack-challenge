/**
 * Beacon de entropia pública (M4) — fonte **externa e imprevisível** para o `publicSeed`
 * que entra no HMAC do crash point. A propriedade anti-pré-computação só existe se o
 * valor for desconhecido pelo operador **no momento em que ele gera a cadeia**: por isso
 * commitamos uma rodada **futura** do beacon (que ainda não foi produzida) ao criar a
 * cadeia, e só **resolvemos** depois. (Equivalente a "hash de um bloco BTC futuro"; aqui
 * usamos o drand, que produz valor novo a cada poucos segundos.)
 *
 * Tudo é best-effort: offline → `null` → o chamador cai para CSPRNG (degrada a
 * propriedade, mas o jogo sobe — `docker:up` zero-manual).
 */
export interface PublicSeedBeacon {
  /**
   * Commita uma referência a um valor **futuro** do beacon (ex.: nº de rodada drand
   * ainda não produzida). `null` se o beacon estiver inacessível.
   */
  commitFutureRound(): Promise<string | null>;

  /**
   * Resolve a referência commitada no valor de entropia (hex), aguardando a rodada
   * futura ser produzida (com timeout). `null` se indisponível.
   */
  resolve(reference: string): Promise<string | null>;
}

export const PUBLIC_SEED_BEACON = Symbol("PUBLIC_SEED_BEACON");
