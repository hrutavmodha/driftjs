export const LexerStateKind = {
  Data: 'Data',
  TagOpen: 'TagOpen',
  EndTagOpen: 'EndTagOpen',
  BeforeAttributeName: 'BeforeAttributeName',
  AttributeName: 'AttributeName',
  AfterAttributeName: 'AfterAttributeName',
  BeforeAttributeValue: 'BeforeAttributeValue',
  AttributeValueQuoted: 'AttributeValueQuoted',
  AttributeValueInterpolation: 'AttributeValueInterpolation',
  Comment: 'Comment',
  Interpolation: 'Interpolation',
  RawText: 'RawText',
  EOF: 'EOF',
} as const;

export type LexerStateKind = typeof LexerStateKind[keyof typeof LexerStateKind];

export type RawTextTagName = 'script' | 'style';
export type LexerInterpolationContext = 'content' | 'attribute';
export type AttributeQuote = '"' | "'";

interface BaseLexerState {
  readonly kind: LexerStateKind;
}

export interface DataLexerState extends BaseLexerState {
  readonly kind: typeof LexerStateKind.Data;
}

export interface TagOpenLexerState extends BaseLexerState {
  readonly kind: typeof LexerStateKind.TagOpen;
}

export interface EndTagOpenLexerState extends BaseLexerState {
  readonly kind: typeof LexerStateKind.EndTagOpen;
}

export interface BeforeAttributeNameLexerState extends BaseLexerState {
  readonly kind: typeof LexerStateKind.BeforeAttributeName;
  readonly tagName: string;
  readonly isClosingTag: boolean;
  readonly entersRawText: boolean;
}

export interface AttributeNameLexerState extends BaseLexerState {
  readonly kind: typeof LexerStateKind.AttributeName;
  readonly tagName: string;
  readonly attributeName: string | null;
}

export interface AfterAttributeNameLexerState extends BaseLexerState {
  readonly kind: typeof LexerStateKind.AfterAttributeName;
  readonly tagName: string;
  readonly attributeName: string;
}

export interface BeforeAttributeValueLexerState extends BaseLexerState {
  readonly kind: typeof LexerStateKind.BeforeAttributeValue;
  readonly tagName: string;
  readonly attributeName: string;
}

export interface AttributeValueQuotedLexerState extends BaseLexerState {
  readonly kind: typeof LexerStateKind.AttributeValueQuoted;
  readonly tagName: string;
  readonly attributeName: string;
  readonly quote: AttributeQuote;
}

export interface AttributeValueInterpolationLexerState extends BaseLexerState {
  readonly kind: typeof LexerStateKind.AttributeValueInterpolation;
  readonly tagName: string;
  readonly attributeName: string;
}

export interface CommentLexerState extends BaseLexerState {
  readonly kind: typeof LexerStateKind.Comment;
}

export interface InterpolationLexerState extends BaseLexerState {
  readonly kind: typeof LexerStateKind.Interpolation;
  readonly context: LexerInterpolationContext;
  readonly tagName: string | null;
}

export interface RawTextLexerState extends BaseLexerState {
  readonly kind: typeof LexerStateKind.RawText;
  readonly tagName: RawTextTagName;
}

export interface EOFLexerState extends BaseLexerState {
  readonly kind: typeof LexerStateKind.EOF;
}

export type DriftLexerState =
  | DataLexerState
  | TagOpenLexerState
  | EndTagOpenLexerState
  | BeforeAttributeNameLexerState
  | AttributeNameLexerState
  | AfterAttributeNameLexerState
  | BeforeAttributeValueLexerState
  | AttributeValueQuotedLexerState
  | AttributeValueInterpolationLexerState
  | CommentLexerState
  | InterpolationLexerState
  | RawTextLexerState
  | EOFLexerState;

export interface LexerStateTransition {
  readonly to: LexerStateKind;
  readonly when: string;
  readonly emits: string;
}

export enum ExprTokenKind {
  Start = 0,
  Punctuator = 1,
  Keyword = 2,
  IdentifierOrLiteral = 3,
  PostfixOp = 4,
}



