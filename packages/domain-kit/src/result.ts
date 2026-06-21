/**
 * Erro como valor: o domínio retorna `Result` para regras de negócio esperadas (saldo insuficiente,
 * aposta fora da fase) em vez de lançar; o type-checker obriga a tratar. Exceptions só nas bordas.
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

  unwrap(): T {
    if (!this._isOk) {
      throw new Error("Called unwrap() on a failed Result");
    }
    return this._value as T;
  }

  unwrapError(): E {
    if (this._isOk) {
      throw new Error("Called unwrapError() on an ok Result");
    }
    return this._error as E;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return this._isOk
      ? Result.ok<U, E>(fn(this._value as T))
      : Result.fail<E, U>(this._error as E);
  }

  mapError<F>(fn: (error: E) => F): Result<T, F> {
    return this._isOk
      ? Result.ok<T, F>(this._value as T)
      : Result.fail<F, T>(fn(this._error as E));
  }
}
