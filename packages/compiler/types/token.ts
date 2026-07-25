/**
 * Line and column position in source code.
 */
export interface SourceLocation {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

/**
 * Start and end location range.
 */
export interface SourceRange {
  readonly start: SourceLocation;
  readonly end: SourceLocation;
}

/**
 * Token types supported by DriftLexer.
 */
export const TokenType = {
  TagOpen: 'TagOpen',
  TagOpenSlash: 'TagOpenSlash',
  TagClose: 'TagClose',
  TagSelfClose: 'TagSelfClose',
  Equals: 'Equals',
  Identifier: 'Identifier',
  StringLiteral: 'StringLiteral',
  Text: 'Text',
  Interpolation: 'Interpolation',
  Comment: 'Comment',
  EOF: 'EOF',
} as const;

export type TokenType = typeof TokenType[keyof typeof TokenType];

/**
 * Token produced by DriftLexer.
 */
export interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly loc: SourceRange;
}
