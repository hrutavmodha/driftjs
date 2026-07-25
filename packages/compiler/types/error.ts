/**
 * Custom error class for lexing errors.
 */
export class DriftLexerError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
    public readonly offset: number,
  ) {
    super(`LexerError [${line}:${column}]: ${message}`);
    this.name = 'DriftLexerError';
  }
}

/**
 * Custom error class for parsing errors.
 */
export class DriftParserError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
    public readonly offset: number,
  ) {
    super(`ParserError [${line}:${column}]: ${message}`);
    this.name = 'DriftParserError';
  }
}
