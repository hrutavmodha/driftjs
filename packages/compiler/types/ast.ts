import type { Node as AcornNode } from 'acorn';
import type { SourceRange } from './token.js';

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
  Async: 'Async',
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
  readonly extraDeps?: any;
}

export interface ForNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.For;
  readonly item: string;
  readonly index: string | null;
  readonly iterable: string | AcornNode;
  readonly key?: string | AcornNode | null;
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

export interface CatchBranch {
  readonly errorVar: string;
  readonly body: readonly TemplateChildNode[];
  readonly loc: SourceRange;
}

export interface AsyncNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.Async;
  readonly promise: string | AcornNode;
  readonly alias: string;
  readonly body: readonly TemplateChildNode[];
  readonly fallback: readonly TemplateChildNode[] | null;
  readonly catchBranch: CatchBranch | null;
}

export interface ElementNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.Element;
  readonly tagName: string;
  readonly attributes: readonly AttributeNode[];
  readonly children: readonly TemplateChildNode[];
  readonly isSelfClosing: boolean;
}

export type TemplateChildNode =
  | ElementNode
  | TextNode
  | InterpolationNode
  | CommentNode
  | IfNode
  | ForNode
  | SwitchNode
  | AsyncNode;

export interface ProgramNode extends BaseASTNode {
  readonly type: typeof ASTNodeType.Program;
  readonly body: readonly TemplateChildNode[];
}

/**
 * Visitor methods for traversing and transforming Template AST nodes.
 */
export interface TemplateASTVisitor {
  enter?: (
    node: TemplateChildNode | ProgramNode,
    parent: TemplateChildNode | ProgramNode | null
  ) => TemplateChildNode | ProgramNode | TemplateChildNode[] | null | void;
  leave?: (
    node: TemplateChildNode | ProgramNode,
    parent: TemplateChildNode | ProgramNode | null
  ) => TemplateChildNode | ProgramNode | TemplateChildNode[] | null | void;
  Element?: (
    node: ElementNode,
    parent: TemplateChildNode | ProgramNode | null
  ) => TemplateChildNode | TemplateChildNode[] | null | void;
  Text?: (
    node: TextNode,
    parent: TemplateChildNode | ProgramNode | null
  ) => TemplateChildNode | TemplateChildNode[] | null | void;
  Interpolation?: (
    node: InterpolationNode,
    parent: TemplateChildNode | ProgramNode | null
  ) => TemplateChildNode | TemplateChildNode[] | null | void;
  Comment?: (
    node: CommentNode,
    parent: TemplateChildNode | ProgramNode | null
  ) => TemplateChildNode | TemplateChildNode[] | null | void;
  If?: (
    node: IfNode,
    parent: TemplateChildNode | ProgramNode | null
  ) => TemplateChildNode | TemplateChildNode[] | null | void;
  For?: (
    node: ForNode,
    parent: TemplateChildNode | ProgramNode | null
  ) => TemplateChildNode | TemplateChildNode[] | null | void;
  Switch?: (
    node: SwitchNode,
    parent: TemplateChildNode | ProgramNode | null
  ) => TemplateChildNode | TemplateChildNode[] | null | void;
  Async?: (
    node: AsyncNode,
    parent: TemplateChildNode | ProgramNode | null
  ) => TemplateChildNode | TemplateChildNode[] | null | void;
  Attribute?: (
    node: AttributeNode,
    parent: ElementNode
  ) => AttributeNode | null | void;
}
