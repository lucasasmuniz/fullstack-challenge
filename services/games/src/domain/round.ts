import { AggregateRoot, Result } from "@crash-game/domain-kit";
import type { ProvablyFairDomainService } from "./provably-fair.service";
import type { ProvablyFairPolicy } from "./provably-fair-policy";
import { RoundStatus } from "./round-status";
import { InvalidRoundTransitionError } from "./round-errors";
import {
  RoundCrashed,
  RoundOpened,
  RoundSettled,
  RoundStarted,
} from "./round-events";

/**
 * Estado completo da rodada — toda construção passa por aqui (construtor privado), o
 * que faz o compilador **garantir** (via `strictPropertyInitialization`) que nenhum
 * campo fica sem atribuição. Evita o `!` (definite assignment) e a fresta de um campo
 * esquecido. Reusado por `open`/`reconstitute` e pela hidratação do repo.
 */
export interface RoundState {
  roundId: string;
  roundNumber: number;
  status: RoundStatus;
  crashPointX100: number;
  serverSeedHash: string;
  serverSeed: string;
  publicSeed: string;
  /** Cadeia de origem da seed (auditoria + detectar fronteira de rotação no verify). */
  chainId: string;
  chainIndex: number;
  version: number;
  bettingEndsAt: Date;
  startedAt: Date | null;
  crashedAt: Date | null;
  settledAt: Date | null;
}

/**
 * Round — agregado raiz do jogo (CQRS: o **estado** é a fonte da verdade; os domain
 * events são side-output para projeções/WebSocket/outbox). Comunica-se com `Bet` apenas
 * por referência de ID (agregados separados).
 *
 * Provably fair: o `crashPointX100` é derivado **no `open()`** a partir da
 * seed resolvida e fica **imutável**. O `Round` não conhece a cadeia de hashes — apenas
 * consome a seed. A `serverSeed` é estritamente privada até o crash (ver `getServerSeed`).
 */
export class Round extends AggregateRoot<string> {
  private _roundNumber: number;
  private _status: RoundStatus;
  private _crashPointX100: number;
  private _serverSeedHash: string;
  private _serverSeed: string;
  private _publicSeed: string;
  private _chainId: string;
  private _chainIndex: number;
  private _version: number;
  private _bettingEndsAt: Date;
  private _startedAt: Date | null;
  private _crashedAt: Date | null;
  private _settledAt: Date | null;

  private constructor(state: RoundState) {
    super(state.roundId);
    this._roundNumber = state.roundNumber;
    this._status = state.status;
    this._crashPointX100 = state.crashPointX100;
    this._serverSeedHash = state.serverSeedHash;
    this._serverSeed = state.serverSeed;
    this._publicSeed = state.publicSeed;
    this._chainId = state.chainId;
    this._chainIndex = state.chainIndex;
    this._version = state.version;
    this._bettingEndsAt = state.bettingEndsAt;
    this._startedAt = state.startedAt;
    this._crashedAt = state.crashedAt;
    this._settledAt = state.settledAt;
  }

  get roundNumber(): number {
    return this._roundNumber;
  }
  get status(): RoundStatus {
    return this._status;
  }
  /**
   * Crash point (×100). **Autoridade do servidor** — o engine lê durante
   * `RUNNING` para decidir o crash (`multiplier ≥ crashPoint`). A apresentação **nunca**
   * pode serializá-lo antes do crash (entregaria o resultado).
   */
  get crashPointX100(): number {
    return this._crashPointX100;
  }
  /** Commitment público (`sha256(serverSeed)`), disponível desde o início da rodada. */
  get serverSeedHash(): string {
    return this._serverSeedHash;
  }
  get publicSeed(): string {
    return this._publicSeed;
  }
  get chainId(): string {
    return this._chainId;
  }
  get chainIndex(): number {
    return this._chainIndex;
  }
  get version(): number {
    return this._version;
  }
  get bettingEndsAt(): Date {
    return this._bettingEndsAt;
  }
  get startedAt(): Date | null {
    return this._startedAt;
  }
  get crashedAt(): Date | null {
    return this._crashedAt;
  }
  get settledAt(): Date | null {
    return this._settledAt;
  }

  /**
   * Barreira de revelação: a `serverSeed` só pode ser lida **após o crash**
   * (`CRASHED`/`SETTLED`). Tentar lê-la em `BETTING`/`RUNNING` é violação de segurança/
   * programação (jamais deve ocorrer em código correto) → **lança**, em vez de retornar.
   */
  getServerSeed(): string {
    if (
      this._status !== RoundStatus.CRASHED &&
      this._status !== RoundStatus.SETTLED
    ) {
      throw new Error(
        "Cannot reveal server seed before the round has crashed.",
      );
    }
    return this._serverSeed;
  }

  canAcceptBets(): boolean {
    return this._status === RoundStatus.BETTING;
  }

  canCashout(): boolean {
    return this._status === RoundStatus.RUNNING;
  }

  /**
   * Abre a rodada na fase `BETTING`, derivando o `crashPointX100` da seed resolvida
   * (provably fair, **antes** das apostas). Valida que o commitment recebido
   * corresponde à seed (defesa em profundidade; mismatch = erro de programação → lança).
   *
   * `fixedCrashPointX100`: quando fornecido, **sobrepõe** o crash point
   * derivado da seed — usado pelo e2e cross-service para forçar um crash reproduzível.
   * Em produção é sempre `undefined` (o opener só o passa atrás da env `GAME_FIXED_CRASH_X100`).
   * Nesse modo o `verify` da rodada diverge de propósito (a seed deriva outro valor); a
   * derivação provably-fair continua sendo o caminho default.
   */
  static open(
    props: {
      roundId: string;
      roundNumber: number;
      serverSeed: string;
      serverSeedHash: string;
      publicSeed: string;
      chainId: string;
      chainIndex: number;
      bettingEndsAt: Date;
    },
    provablyFair: ProvablyFairDomainService,
    policy: ProvablyFairPolicy,
    now: Date,
    fixedCrashPointX100?: number,
  ): Round {
    if (provablyFair.hashSeed(props.serverSeed) !== props.serverSeedHash) {
      throw new Error("serverSeedHash não corresponde à serverSeed fornecida.");
    }
    const round = new Round({
      roundId: props.roundId,
      roundNumber: props.roundNumber,
      status: RoundStatus.BETTING,
      crashPointX100:
        fixedCrashPointX100 ??
        provablyFair.deriveCrashPoint(
          props.serverSeed,
          props.publicSeed,
          policy,
        ),
      serverSeedHash: props.serverSeedHash,
      serverSeed: props.serverSeed,
      publicSeed: props.publicSeed,
      chainId: props.chainId,
      chainIndex: props.chainIndex,
      version: 1,
      bettingEndsAt: props.bettingEndsAt,
      startedAt: null,
      crashedAt: null,
      settledAt: null,
    });
    round.addEvent(
      new RoundOpened(
        round.id,
        round._roundNumber,
        round._serverSeedHash,
        round._publicSeed,
        round._bettingEndsAt,
        now,
      ),
    );
    return round;
  }

  start(now: Date): Result<void, InvalidRoundTransitionError> {
    if (this._status !== RoundStatus.BETTING) {
      return Result.fail(
        new InvalidRoundTransitionError(this._status, RoundStatus.RUNNING),
      );
    }
    this._status = RoundStatus.RUNNING;
    this._startedAt = now;
    this._version += 1;
    this.addEvent(new RoundStarted(this.id, now, now));
    return Result.ok(undefined);
  }

  crash(now: Date): Result<void, InvalidRoundTransitionError> {
    if (this._status !== RoundStatus.RUNNING) {
      return Result.fail(
        new InvalidRoundTransitionError(this._status, RoundStatus.CRASHED),
      );
    }
    this._status = RoundStatus.CRASHED;
    this._crashedAt = now;
    this._version += 1;
    this.addEvent(
      new RoundCrashed(
        this.id,
        this._crashPointX100,
        this._serverSeed,
        this._publicSeed,
        now,
        now,
      ),
    );
    return Result.ok(undefined);
  }

  settle(now: Date): Result<void, InvalidRoundTransitionError> {
    if (this._status !== RoundStatus.CRASHED) {
      return Result.fail(
        new InvalidRoundTransitionError(this._status, RoundStatus.SETTLED),
      );
    }
    this._status = RoundStatus.SETTLED;
    this._settledAt = now;
    this._version += 1;
    this.addEvent(new RoundSettled(this.id, now, now));
    return Result.ok(undefined);
  }

  static reconstitute(state: RoundState): Round {
    return new Round(state);
  }

  snapshot(): RoundState {
    return {
      roundId: this.id,
      roundNumber: this._roundNumber,
      status: this._status,
      crashPointX100: this._crashPointX100,
      serverSeedHash: this._serverSeedHash,
      serverSeed: this._serverSeed,
      publicSeed: this._publicSeed,
      chainId: this._chainId,
      chainIndex: this._chainIndex,
      version: this._version,
      bettingEndsAt: this._bettingEndsAt,
      startedAt: this._startedAt,
      crashedAt: this._crashedAt,
      settledAt: this._settledAt,
    };
  }
}
