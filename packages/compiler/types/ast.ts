import type { Node as AcornNode } from 'acorn';
import { SourceRange } from './token.js';

/**
 * AST Node Types supported by DriftParser.
 */
export const ASTNodeType = {
  Program: 'Program',
  Element: 'Element',
  Text: 'Text',
  Interpolation: 'Interpolation',
  Attribute: 'Attribute',
  Comment: 'Comment',
} as const;

export type ASTNodeType = typeof ASTNodeType[keyof typeof ASTNodeType];

export interface BaseASTNode {
  readonly type: ASTNodeType;
  readonly loc: SourceRange;
}

export interface AttributeNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.Attribute;
  readonly name: string;
  readonly value: string | InterpolationNode | null;
}

export interface InterpolationNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.Interpolation;
  readonly expression: string | AcornNode;
}

export interface TextNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.Text;
  readonly content: string | AcornNode | readonly AcornNode[];
}

export interface CommentNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.Comment;
  readonly content: string;
}

export interface ElementNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.Element;
  readonly tagName: string;
  readonly attributes: readonly AttributeNode[];
  readonly children: readonly TemplateChildNode[];
  readonly isSelfClosing: boolean;
}

export type TemplateChildNode = ElementNode | TextNode | InterpolationNode | CommentNode;

export interface ProgramNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.Program;
  readonly body: readonly TemplateChildNode[];
}
