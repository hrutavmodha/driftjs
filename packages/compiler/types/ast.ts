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
  If: 'If',
  For: 'For',
  Switch: 'Switch',
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

export interface IfNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.If;
  readonly test: string | AcornNode;
  readonly consequent: readonly TemplateChildNode[];
  readonly alternate: readonly TemplateChildNode[] | IfNode | null;
}

export interface ForNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.For;
  readonly item: string;
  readonly index: string | null;
  readonly iterable: string | AcornNode;
  readonly body: readonly TemplateChildNode[];
}

export interface CaseBranch {
  readonly expression: string | AcornNode | null; // null for default
  readonly body: readonly TemplateChildNode[];
  readonly loc: SourceRange;
}

export interface SwitchNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.Switch;
  readonly discriminant: string | AcornNode;
  readonly cases: readonly CaseBranch[];
}

export interface ElementNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.Element;
  readonly tagName: string;
  readonly attributes: readonly AttributeNode[];
  readonly children: readonly TemplateChildNode[];
  readonly isSelfClosing: boolean;
}

export type TemplateChildNode = ElementNode | TextNode | InterpolationNode | CommentNode | IfNode | ForNode | SwitchNode;

export interface ProgramNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.Program;
  readonly body: readonly TemplateChildNode[];
}
