import * as acorn from 'acorn';
import {
  ProgramNode,
  TemplateChildNode,
  ElementNode,
  InterpolationNode,
  IfNode,
  ASTNodeType,
  DriftParserError,
} from '../types/index.js';

/**
 * Transformer for raw Drift template AST.
 * Performs AST enrichment by:
 * 1. Stripping redundant whitespace/newline TextNodes between element boundaries.
 * 2. Parsing raw JS strings in interpolations into Acorn AST nodes.
 * 3. Parsing raw JS strings inside <script> tags into Acorn AST nodes.
 */
export class DriftTransformer {
  private readonly rawAst: ProgramNode;

  constructor(rawAst: ProgramNode) {
    this.rawAst = rawAst;
  }

  /**
   * Transforms raw AST into an enriched compiler AST.
   * @returns Transformed ProgramNode.
   */
  public transform(): ProgramNode {
    return {
      ...this.rawAst,
      body: this.transformChildren(this.rawAst.body),
    };
  }

  /**
   * Transforms array of child nodes, filtering out redundant whitespace-only TextNodes.
   */
  private transformChildren(children: readonly TemplateChildNode[]): TemplateChildNode[] {
    const transformed: TemplateChildNode[] = [];

    for (const child of children) {
      if (child.type === ASTNodeType.Text && typeof child.content === 'string' && this.isWhitespaceOnly(child.content)) {
        continue;
      }

      transformed.push(this.transformNode(child));
    }

    return transformed;
  }

  /**
   * Transforms an individual AST node.
   */
  private transformNode(node: TemplateChildNode): TemplateChildNode {
    if (node.type === ASTNodeType.Element) {
      if (node.tagName === 'script') {
        return this.transformScriptElement(node);
      }
      return {
        ...node,
        children: this.transformChildren(node.children),
      };
    }

    if (node.type === ASTNodeType.Interpolation) {
      return this.transformInterpolation(node);
    }

    if (node.type === ASTNodeType.If) {
      const parsedTest = typeof node.test === 'string' && node.test.trim().length > 0
        ? acorn.parseExpressionAt(node.test, 0, { ecmaVersion: 'latest' })
        : node.test;

      let transformedAlt: TemplateChildNode[] | IfNode | null = null;
      if (Array.isArray(node.alternate)) {
        transformedAlt = this.transformChildren(node.alternate);
      } else if (node.alternate !== null) {
        transformedAlt = this.transformNode(node.alternate as IfNode) as IfNode;
      }

      return {
        ...node,
        test: parsedTest,
        consequent: this.transformChildren(node.consequent),
        alternate: transformedAlt,
      };
    }

    if (node.type === ASTNodeType.For) {
      return {
        ...node,
        iterable: typeof node.iterable === 'string'
          ? acorn.parseExpressionAt(node.iterable, 0, { ecmaVersion: 'latest' })
          : node.iterable,
        body: this.transformChildren(node.body),
      };
    }

    if (node.type === ASTNodeType.Switch) {
      return {
        ...node,
        discriminant: typeof node.discriminant === 'string'
          ? acorn.parseExpressionAt(node.discriminant, 0, { ecmaVersion: 'latest' })
          : node.discriminant,
        cases: node.cases.map((c) => ({
          ...c,
          expression: typeof c.expression === 'string' && c.expression.trim().length > 0
            ? acorn.parseExpressionAt(c.expression, 0, { ecmaVersion: 'latest' })
            : c.expression,
          body: this.transformChildren(c.body),
        })),
      };
    }

    return node;
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
