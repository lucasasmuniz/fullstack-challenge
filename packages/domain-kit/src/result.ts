/**
 * Result<T, E> — erro como valor (error-as-value).
 *
 * O domínio retorna `Result` para regras de negócio esperadas (saldo insuficiente,
 * aposta fora da fase, etc.) em vez de lançar exceptions. O type-checker obriga a tratar.
 * Ver ADR 0006 (Result no domínio + exceptions nas bordas).
 */
export class Result<T, E> {
  private constructor(
    private readonly _isOk: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  static ok<T, E = never>(value: T): Result<T, E> {
    return new Result<T, E>(true, value, undefined);
  }

  static fail<E, T = never>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  get isOk(): boolean {
    return this._isOk;
  }

  get isFail(): boolean {
    return !this._isOk;
  }

  /** Retorna o valor; lança se for falha (erro de programação — use após checar isOk). */
  unwrap(): T {
    if (!this._isOk) {
      throw new Error("Called unwrap() on a failed Result");
    }
    return this._value as T;
  }

  /** Retorna o erro; lança se for sucesso (erro de programação — use após checar isFail). */
  unwrapError(): E {
    if (this._isOk) {
      throw new Error("Called unwrapError() on an ok Result");
    }
    return this._error as E;
  }

  /** Transforma o valor de sucesso; propaga a falha intacta. */
  map<U>(fn: (value: T) => U): Result<U, E> {
    return this._isOk
      ? Result.ok<U, E>(fn(this._value as T))
      : Result.fail<E, U>(this._error as E);
  }

  /** Transforma o erro; propaga o sucesso intacto. */
  mapError<F>(fn: (error: E) => F): Result<T, F> {
    return this._isOk
      ? Result.ok<T, F>(this._value as T)
      : Result.fail<F, T>(fn(this._error as E));
  }
}
