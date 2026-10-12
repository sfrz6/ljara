/**
 * Domain errors carry a stable code that maps to a translated message (err.<code>) and optional params.
 * The UI never shows raw exception text.
 */
export class DomainError extends Error {
  readonly code: string;
  readonly params: Record<string, string | number>;
  readonly field?: string;

  constructor(code: string, params: Record<string, string | number> = {}, field?: string) {
    super(code);
    this.name = "DomainError";
    this.code = code;
    this.params = params;
    this.field = field;
  }
}

export class ForbiddenError extends DomainError {
  constructor(permission?: string) {
    super("forbidden", permission ? { permission } : {});
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends DomainError {
  constructor(entity = "record") {
    super("not_found", { entity });
    this.name = "NotFoundError";
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
