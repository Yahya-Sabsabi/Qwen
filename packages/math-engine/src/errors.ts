/** Typed error used across all engines. Never leaks stack traces to users. */
export type MathErrorCode =
  | 'unexpected_token'
  | 'unbalanced_paren'
  | 'unknown_identifier'
  | 'unknown_function'
  | 'invalid_syntax'
  | 'division_by_zero'
  | 'domain_error'
  | 'too_complex'
  | 'not_supported'
  | 'no_solution';

export class MathError extends Error {
  code: MathErrorCode;
  position?: number;
  hint?: string;

  constructor(code: MathErrorCode, message: string, position?: number, hint?: string) {
    super(message);
    this.name = 'MathError';
    this.code = code;
    this.position = position;
    this.hint = hint;
  }
}

/** Human friendly message (used directly by UI). */
export function explainError(err: unknown): string {
  if (err instanceof MathError) {
    const pos = err.position !== undefined ? ` at position ${err.position + 1}` : '';
    return `${err.message}${pos}${err.hint ? `. ${err.hint}` : ''}`;
  }
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred.';
}
