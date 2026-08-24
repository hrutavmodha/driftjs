import * as acorn from 'acorn';
import type {
  ProgramNode,
  TemplateChildNode,
  ElementNode,
  TextNode,
  InterpolationNode,
  CommentNode,
  AttributeNode,
  IfNode,
  ForNode,
  SwitchNode,
} from '../types/index.js';
import {
  ASTNodeType,
  DriftParserError,
} from '../types/index.js';

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
  Attribute?: (
    node: AttributeNode,
    parent: ElementNode
  ) => AttributeNode | null | void;
}

/**
 * Formal Template AST Visitor that traverses the AST hierarchy and applies visitors.
 */
export function traverseTemplateAST<T extends ProgramNode | TemplateChildNode>(
  root: T,
  visitor: TemplateASTVisitor
): T {
  function visitChildren(
    children: readonly TemplateChildNode[],
    parent: TemplateChildNode | ProgramNode
  ): TemplateChildNode[] {
    const result: TemplateChildNode[] = [];
    for (const child of children) {
      const res = visitNode(child, parent);
      if (res === null) {
        continue;
      } else if (Array.isArray(res)) {
        result.push(...res);
      } else {
        result.push(res);
      }
    }
    return result;
  }

  function visitNode(
    node: TemplateChildNode | ProgramNode,
    parent: TemplateChildNode | ProgramNode | null
  ): any {
    if (!node || typeof node !== 'object') return node;

    let current: any = node;

    // 1. enter hook
    if (visitor.enter) {
      const enterRes = visitor.enter(current, parent);
      if (enterRes !== undefined) {
        if (enterRes === null || Array.isArray(enterRes)) return enterRes;
        current = enterRes;
      }
    }

    // 2. node type specific hook
    const typeHook = (visitor as Record<string, any>)[current.type];
    if (typeHook) {
      const hookRes = typeHook(current, parent);
      if (hookRes !== undefined) {
        if (hookRes === null || Array.isArray(hookRes)) return hookRes;
        current = hookRes;
      }
    }

    // 3. Recurse into children
    switch (current.type) {
      case ASTNodeType.Program: {
        const newBody = visitChildren(current.body, current);
        current = { ...current, body: newBody };
        break;
      }
      case ASTNodeType.Element: {
        let newAttrs = current.attributes;
        if (visitor.Attribute && Array.isArray(current.attributes)) {
          const mappedAttrs: AttributeNode[] = [];
          for (const attr of current.attributes) {
            const attrRes = visitor.Attribute(attr, current);
            if (attrRes !== null && attrRes !== undefined) {
              mappedAttrs.push(attrRes);
            } else if (attrRes === undefined) {
              mappedAttrs.push(attr);
            }
          }
          newAttrs = mappedAttrs;
        }
        const newChildren = visitChildren(current.children, current);
        current = { ...current, attributes: newAttrs, children: newChildren };
        break;
      }
      case ASTNodeType.If: {
        const newConsequent = visitChildren(current.consequent, current);
        let newAlternate = current.alternate;
        if (Array.isArray(current.alternate)) {
          newAlternate = visitChildren(current.alternate, current);
        } else if (current.alternate !== null && typeof current.alternate === 'object') {
          newAlternate = visitNode(current.alternate, current);
        }
        current = { ...current, consequent: newConsequent, alternate: newAlternate };
        break;
      }
      case ASTNodeType.For: {
        const newBody = visitChildren(current.body, current);
        current = { ...current, body: newBody };
        break;
      }
      case ASTNodeType.Switch: {
        if (Array.isArray(current.cases)) {
          const newCases = current.cases.map((c: any) => ({
            ...c,
            body: visitChildren(c.body, current),
          }));
          current = { ...current, cases: newCases };
        }
        break;
      }
    }

    // 4. leave hook
    if (visitor.leave) {
      const leaveRes = visitor.leave(current, parent);
      if (leaveRes !== undefined) {
        return leaveRes;
      }
    }

    return current;
  }

  return visitNode(root, null) as T;
}

/**
 * Transformer for raw Drift template AST.
 * Performs AST enrichment via structured visitor passes:
 * 1. Stripping redundant whitespace/newline TextNodes between element boundaries.
 * 2. Parsing raw JS strings in interpolations, directives, and <script> tags into Acorn AST nodes.
 * 3. Lowering @switch / @case directives into equivalent reactive @if / @else if chains.
 */
export class DriftTransformer {
  private readonly rawAst: ProgramNode;
  private switchCounter = 0;

  constructor(rawAst: ProgramNode) {
    this.rawAst = rawAst;
  }

  /**
   * Transforms raw AST into an enriched compiler AST.
   * @returns Transformed ProgramNode.
   */
  public transform(): ProgramNode {
    // Pass 1: Strip redundant whitespace-only text nodes
    const strippedAst = traverseTemplateAST(this.rawAst, {
      Text: (node) => {
        if (typeof node.content === 'string' && this.isWhitespaceOnly(node.content)) {
          return null;
        }
      },
    });

    // Pass 2: Lower @switch / @case directives to @if chains
    const loweredAst = traverseTemplateAST(strippedAst, {
      Switch: (node) => {
        return this.transformSwitchToIfChain(node);
      },
    });

    // Pass 3: Parse JS expressions into Acorn AST nodes
    const enrichedAst = traverseTemplateAST(loweredAst, {
      Interpolation: (node) => {
        return this.transformInterpolation(node);
      },
      Element: (node) => {
        if (node.tagName === 'script') {
          return this.transformScriptElement(node);
        }
        if (node.attributes.some((a) => a.value !== null && typeof a.value !== 'string')) {
          return {
            ...node,
            attributes: node.attributes.map((attr) => {
              if (
                attr.type === ASTNodeType.Attribute &&
                attr.value !== null &&
                typeof attr.value !== 'string' &&
                attr.value.type === ASTNodeType.Interpolation
              ) {
                return { ...attr, value: this.transformInterpolation(attr.value) };
              }
              return attr;
            }),
          };
        }
      },
      If: (node) => {
        if (typeof node.test === 'string' && node.test.trim().length > 0) {
          return {
            ...node,
            test: acorn.parseExpressionAt(node.test, 0, { ecmaVersion: 'latest' }),
          };
        }
      },
      For: (node) => {
        return {
          ...node,
          iterable:
            typeof node.iterable === 'string'
              ? acorn.parseExpressionAt(node.iterable, 0, { ecmaVersion: 'latest' })
              : node.iterable,
          key:
            typeof node.key === 'string' && node.key.trim().length > 0
              ? acorn.parseExpressionAt(node.key, 0, { ecmaVersion: 'latest' })
              : (node.key ?? null),
        };
      },
    });

    return enrichedAst;
  }

  /**
   * Transforms @switch node into a reactive @if / @else if / @else chain.
   */
  private transformSwitchToIfChain(node: SwitchNode): TemplateChildNode {
    const discAst =
      typeof node.discriminant === 'string'
        ? acorn.parseExpressionAt(node.discriminant, 0, { ecmaVersion: 'latest' })
        : node.discriminant;

    const isSimple =
      (discAst as any).type === 'Identifier' ||
      (discAst as any).type === 'Literal' ||
      (discAst as any).type === 'MemberExpression';
    const discVarName = `__drift_sw_${this.switchCounter++}`;
    let isFirstCase = true;

    const buildIfChain = (index: number): TemplateChildNode | TemplateChildNode[] | null => {
      const c = node.cases[index];
      if (!c) return null;
      if (c.expression === null) {
        const consequent = [...c.body];
        const nextAlt = buildIfChain(index + 1);

        let alternate: TemplateChildNode[] | IfNode | null = null;
        if (Array.isArray(nextAlt)) {
          alternate = nextAlt;
        } else if (nextAlt !== null && (nextAlt as TemplateChildNode).type === ASTNodeType.If) {
          alternate = nextAlt as IfNode;
        }

        if (index > 0 && alternate === null) {
          return consequent;
        }

        const trueAst: acorn.Node = {
          type: 'Literal',
          value: true,
          raw: 'true',
          start: 0,
          end: 0,
        } as any;

        return {
          type: ASTNodeType.If,
          test: trueAst,
          consequent,
          alternate,
          loc: c.loc,
        };
      }

      const caseAst =
        typeof c.expression === 'string' && c.expression.trim().length > 0
          ? acorn.parseExpressionAt(c.expression, 0, { ecmaVersion: 'latest' })
          : c.expression;

      let leftNode: acorn.Node;
      if (isSimple) {
        leftNode = structuredClone(discAst);
      } else if (isFirstCase) {
        isFirstCase = false;
        leftNode = {
          type: 'AssignmentExpression',
          operator: '=',
          left: {
            type: 'Identifier',
            name: discVarName,
            start: 0,
            end: 0,
          },
          right: structuredClone(discAst),
          start: 0,
          end: 0,
        } as any;
      } else {
        leftNode = {
          type: 'Identifier',
          name: discVarName,
          start: 0,
          end: 0,
        } as any;
      }

      const parsedTest: acorn.Node = {
        type: 'BinaryExpression',
        operator: '===',
        left: leftNode as any,
        right: caseAst as any,
        start: 0,
        end: 0,
      } as any;

      const consequent = [...c.body];
      const nextAlt = buildIfChain(index + 1);

      let alternate: TemplateChildNode[] | IfNode | null = null;
      if (Array.isArray(nextAlt)) {
        alternate = nextAlt;
      } else if (nextAlt !== null && (nextAlt as TemplateChildNode).type === ASTNodeType.If) {
        alternate = nextAlt as IfNode;
      }

      return {
        type: ASTNodeType.If,
        test: parsedTest,
        consequent,
        alternate,
        extraDeps: structuredClone(discAst),
        loc: c.loc,
      };
    };

    const res = buildIfChain(0);
    if (!res) {
      return {
        type: ASTNodeType.Comment,
        content: 'empty switch',
        loc: node.loc,
      };
    }
    if (Array.isArray(res)) {
      if (res.length === 0) {
        return {
          type: ASTNodeType.Comment,
          content: 'empty switch',
          loc: node.loc,
        };
      }
      const trueAst: acorn.Node = {
        type: 'Literal',
        value: true,
        raw: 'true',
        start: 0,
        end: 0,
      } as any;
      return {
        type: ASTNodeType.If,
        test: trueAst,
        consequent: res,
        alternate: null,
        loc: node.loc,
      };
    }
    return res;
  }

  /**
   * Parses raw JS string expression in interpolation into an Acorn AST node.
   */
  private transformInterpolation(node: InterpolationNode): InterpolationNode {
    if (typeof node.expression !== 'string') {
      return node;
    }

    let parsedExpr: acorn.Node;
    try {
      parsedExpr = acorn.parseExpressionAt(node.expression, 0, {
        ecmaVersion: 'latest',
        allowAwaitOutsideFunction: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new DriftParserError(
        `Failed to parse JS expression in interpolation: ${msg}`,
        node.loc.start.line,
        node.loc.start.column,
        node.loc.start.offset
      );
    }

    return {
      ...node,
      expression: parsedExpr,
    };
  }

  /**
   * Parses raw JS string inside <script> tags into Acorn AST statement(s), stripping top-level Program wrapper.
   */
  private transformScriptElement(node: ElementNode): ElementNode {
    const processedChildren = node.children.map((child) => {
      if (child.type === ASTNodeType.Text && typeof child.content === 'string') {
        let scriptAst: acorn.Node | readonly acorn.Node[];
        try {
          const program = acorn.parse(child.content, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            allowAwaitOutsideFunction: true,
            allowReturnOutsideFunction: true,
          });

          if (program.body.length === 1 && program.body[0] !== undefined) {
            scriptAst = program.body[0];
          } else {
            scriptAst = program.body;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new DriftParserError(
            `Failed to parse script tag JS content: ${msg}`,
            child.loc.start.line,
            child.loc.start.column,
            child.loc.start.offset
          );
        }

        return {
          ...child,
          content: scriptAst,
        };
      }
      return child;
    });

    return {
      ...node,
      children: processedChildren,
    };
  }

  /**
   * Checks if string consists only of whitespace characters (space, tab, newline, carriage return) using ASCII codes.
   */
  private isWhitespaceOnly(text: string): boolean {
    if (text.length === 0) return false;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code !== 32 && code !== 9 && code !== 10 && code !== 13) {
        return false;
      }
    }
    return true;
  }
}
