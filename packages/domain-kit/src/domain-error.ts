/**
 * Base de todos os erros de domínio. Cada erro concreto carrega um `code` estável
 * que o Exception Filter (camada de apresentação) mapeia para o HTTP correto.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
