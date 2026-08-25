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
  CompiledModule,
  ReactiveBinding,
  DerivedBinding,
  ImportSpec,
} from '../types/index.js';
import {
  ASTNodeType,
  Opcode,
} from '../types/index.js';
import * as walk from 'acorn-walk';

/**
 * Generator for Drift template compiler.
 * Converts enriched AST (ProgramNode) into register-based Virtual Machine bytecode
 * and a constant pool module.
 */
export class DriftGenerator {
  private readonly ast: ProgramNode;
  private bytecode: number[] = [];
  private constants: any[] = [];
  private nextRegisterId = 0;
  private declaredVars: Set<string> = new Set();
  private imports: ImportSpec[] = [];
  private bindingPositions: Map<string, { pc: number; opcode: Opcode }[]> = new Map();
  private derivedBindings: DerivedBinding[] = [];
  private pendingDerived: { name: string; arg: any }[] = [];

  constructor(ast: ProgramNode) {
    this.ast = ast;
  }

  /**
   * Compiles the AST into a bytecode stream and constant pool module.
   * @returns CompiledModule containing numeric bytecode and constant pool.
   */
  public generate(): CompiledModule {
    this.bytecode = [];
    this.constants = [];
    this.nextRegisterId = 0;
    this.declaredVars = new Set();
    this.imports = [];
    this.bindingPositions = new Map();
    this.derivedBindings = [];
    this.pendingDerived = [];

    this.collectDeclaredVars(this.ast.body);
    this.processDerivedBindings();

    if (this.ast.body.length === 0) {
      const rootReg = this.allocRegister();
      this.emit(Opcode.CREATE_FRAGMENT, rootReg);
      this.emit(Opcode.RETURN, rootReg);
      return {
        bytecode: this.bytecode,
        constants: this.constants,
        reactiveBindings: this.buildReactiveBindings(),
        declaredVars: [...this.declaredVars],
        derived: this.derivedBindings,
        imports: this.imports,
      };
    }

    if (this.ast.body.length === 1 && this.ast.body[0]?.type === ASTNodeType.Element) {
      const rootReg = this.allocRegister();
      this.compileElement(this.ast.body[0] as ElementNode, rootReg);
      this.emit(Opcode.RETURN, rootReg);
    } else {
      const rootReg = this.allocRegister();
      this.emit(Opcode.CREATE_FRAGMENT, rootReg);
      for (const child of this.ast.body) {
        this.compileNode(child, rootReg);
      }
      this.emit(Opcode.RETURN, rootReg);
    }

    return {
      bytecode: this.bytecode,
      constants: this.constants,
      reactiveBindings: this.buildReactiveBindings(),
      declaredVars: [...this.declaredVars],
      derived: this.derivedBindings,
      imports: this.imports,
    };
  }

  /**
   * Compiles a single TemplateChildNode into register bytecode operations.
   */
  private compileNode(node: TemplateChildNode, parentReg: number): void {
    switch (node.type) {
      case ASTNodeType.Element:
        // Script elements are not rendered into the DOM — they initialise scope.
        if ((node as ElementNode).tagName === 'script') {
          this.compileScriptElement(node as ElementNode);
        } else {
          this.compileElementNode(node, parentReg);
        }
        break;
      case ASTNodeType.Text:
        this.compileTextNode(node, parentReg);
        break;
      case ASTNodeType.Interpolation:
        this.compileInterpolationNode(node, parentReg);
        break;
      case ASTNodeType.Comment:
        this.compileCommentNode(node, parentReg);
        break;
      case ASTNodeType.If:
        this.compileIfNode(node, parentReg);
        break;
      case ASTNodeType.For:
        this.compileForNode(node, parentReg);
        break;
    }
  }

  private filterRuntimeScriptAst(content: any): any {
    if (Array.isArray(content)) {
      const filtered = content
        .map((stmt: any) => this.filterScriptStatement(stmt))
        .filter(Boolean);
      return filtered.length === 1 ? filtered[0] : filtered;
    }
    return this.filterScriptStatement(content);
  }

  private filterScriptStatement(stmt: any): any {
    if (!stmt || typeof stmt !== 'object') return stmt;
    if (stmt.type === 'ImportDeclaration') return null;
    if (stmt.type === 'VariableDeclaration') {
      const nonDerivedDecls = stmt.declarations.filter((decl: any) => {
        return !(
          decl.init?.type === 'CallExpression' &&
          decl.init.callee?.type === 'Identifier' &&
          decl.init.callee.name === 'derive'
        );
      });
      if (nonDerivedDecls.length === 0) return null;
      return { ...stmt, declarations: nonDerivedDecls };
    }
    return stmt;
  }

  /**
   * Emits an EXEC_SCRIPT instruction for a <script> element.
   * The script body AST is stored in the constant pool and executed by the runtime
   * before any DOM construction, populating the component scope with declared
   * variables and functions.
   */
  private compileScriptElement(node: ElementNode): void {
    for (const child of node.children) {
      if (child.type === ASTNodeType.Text && typeof child.content === 'object' && child.content !== null) {
        const filtered = this.filterRuntimeScriptAst(child.content);
        if (filtered !== null && (!Array.isArray(filtered) || filtered.length > 0)) {
          const scriptBodyIdx = this.addConstant(filtered);
          this.emit(Opcode.EXEC_SCRIPT, scriptBodyIdx);
        }
      }
    }
  }

  private isComponentTag(tagName: string): boolean {
    if (this.imports.some((imp) => imp.localName === tagName)) return true;
    const firstChar = tagName.charAt(0);
    return firstChar !== '' && firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase();
  }

  private compileElement(node: ElementNode, targetReg: number): void {
    const isComp = this.isComponentTag(node.tagName);
    const tagConstIdx = this.addConstant(node.tagName);

    if (isComp) {
      const propsSpec: Record<string, any> = { __drift_props__: true };
      for (const attr of node.attributes) {
        if (attr.type === ASTNodeType.Attribute) {
          if (attr.value === null) {
            propsSpec[attr.name] = true;
          } else if (typeof attr.value === 'string') {
            propsSpec[attr.name] = attr.value;
          } else if (attr.value.type === ASTNodeType.Interpolation) {
            const expr = attr.value.expression;
            if (expr && typeof expr === 'object' && expr.type) {
              const codeStr = astToJS(expr);
              propsSpec[attr.name] = {
                __drift_fn__: `(scope, declaredVars, setScopeValue, inScopeChain, resolveIterable, _get) => (${codeStr})`
              };
            } else {
              propsSpec[attr.name] = expr;
            }
          }
        }
      }

      let childrenSubMod: { bytecode: number[]; constants: any[]; reactiveBindings: ReactiveBinding[] } | null = null;
      if (node.children && node.children.length > 0) {
        const filteredChildren = node.children.filter((c) => {
          if (c.type === ASTNodeType.Text && typeof c.content === 'string' && c.content.trim() === '') {
            return false;
          }
          return true;
        });
        if (filteredChildren.length > 0) {
          childrenSubMod = this.compileNodesToSubModule(filteredChildren);
          const childrenSubModIdx = this.addConstant(childrenSubMod);
          propsSpec.__drift_children__ = childrenSubModIdx;
        }
      }

      const hasPropsOrChildren = Object.keys(propsSpec).length > 1;
      const propsSpecIdx = hasPropsOrChildren ? this.addConstant(propsSpec) : 0xFF;
      const pc = this.bytecode.length;
      this.emit(Opcode.MOUNT_COMPONENT, targetReg, tagConstIdx, propsSpecIdx);

      for (const attr of node.attributes) {
        if (attr.type === ASTNodeType.Attribute && attr.value !== null && typeof attr.value !== 'string' && attr.value.type === ASTNodeType.Interpolation) {
          this.recordBindingPositions(attr.value.expression, pc, Opcode.MOUNT_COMPONENT);
        }
      }
      if (childrenSubMod) {
        for (const binding of childrenSubMod.reactiveBindings) {
          if (this.declaredVars.has(binding.variable)) {
            if (!this.bindingPositions.has(binding.variable)) {
              this.bindingPositions.set(binding.variable, []);
            }
            this.bindingPositions.get(binding.variable)!.push({ pc, opcode: Opcode.MOUNT_COMPONENT });
          }
        }
      }
    } else {
      this.emit(Opcode.CREATE_ELEMENT, targetReg, tagConstIdx);

      for (const attr of node.attributes) {
        this.compileAttributeNode(attr, targetReg);
      }

      for (const child of node.children) {
        this.compileNode(child, targetReg);
      }
    }
  }

  private compileElementNode(node: ElementNode, parentReg: number): void {
    const elemReg = this.allocRegister();
    this.compileElement(node, elemReg);
    this.emit(Opcode.APPEND_CHILD, parentReg, elemReg);
  }

  private compileAttributeNode(attr: AttributeNode, elemReg: number): void {
    const nameIdx = this.addConstant(attr.name);

    if (attr.value === null) {
      const valIdx = this.addConstant(true);
      this.emit(Opcode.SET_ATTR, elemReg, nameIdx, valIdx, 0);
    } else if (typeof attr.value === 'string') {
      const valIdx = this.addConstant(attr.value);
      this.emit(Opcode.SET_ATTR, elemReg, nameIdx, valIdx, 0);
    } else if (attr.value.type === ASTNodeType.Interpolation) {
      const exprIdx = this.addConstant(attr.value.expression);
      const pc = this.bytecode.length;
      this.emit(Opcode.SET_ATTR, elemReg, nameIdx, exprIdx, 1);
      this.recordBindingPositions(attr.value.expression, pc, Opcode.SET_ATTR);
    }
  }

  private compileTextNode(node: TextNode, parentReg: number): void {
    const textReg = this.allocRegister();
    const textConstIdx = this.addConstant(node.content);
    this.emit(Opcode.CREATE_TEXT, textReg, textConstIdx);
    this.emit(Opcode.APPEND_CHILD, parentReg, textReg);
  }

  private compileInterpolationNode(node: InterpolationNode, parentReg: number): void {
    const textReg = this.allocRegister();
    const exprConstIdx = this.addConstant(node.expression);
    const pc = this.bytecode.length;
    this.emit(Opcode.INTERPOLATE_TEXT, textReg, exprConstIdx);
    this.emit(Opcode.APPEND_CHILD, parentReg, textReg);
    this.recordBindingPositions(node.expression, pc, Opcode.INTERPOLATE_TEXT);
  }

  private compileCommentNode(node: CommentNode, parentReg: number): void {
    const commentReg = this.allocRegister();
    const commentConstIdx = this.addConstant(node.content);
    this.emit(Opcode.CREATE_COMMENT, commentReg, commentConstIdx);
    this.emit(Opcode.APPEND_CHILD, parentReg, commentReg);
  }

  /**
   * Compiles a list of child nodes into an isolated sub-module.
   * The sub-module shares `declaredVars` with the parent (so reactive var detection works)
   * but has its own fresh bytecode, constants, and registers.
   */
  private compileNodesToSubModule(
    nodes: readonly TemplateChildNode[]
  ): { bytecode: number[]; constants: any[]; reactiveBindings: ReactiveBinding[] } {
    // save parent state
    const savedBytecode = this.bytecode;
    const savedConstants = this.constants;
    const savedNextReg = this.nextRegisterId;
    const savedBindPos = this.bindingPositions;

    // fresh slate for the sub-module
    this.bytecode = [];
    this.constants = [];
    this.nextRegisterId = 0;
    this.bindingPositions = new Map();

    const rootReg = this.allocRegister();
    this.emit(Opcode.CREATE_FRAGMENT, rootReg);
    for (const node of nodes) {
      this.compileNode(node, rootReg);
    }
    this.emit(Opcode.RETURN, rootReg);

    const result = {
      bytecode: this.bytecode,
      constants: this.constants,
      reactiveBindings: this.buildReactiveBindings(),
    };

    // restore parent state
    this.bytecode = savedBytecode;
    this.constants = savedConstants;
    this.nextRegisterId = savedNextReg;
    this.bindingPositions = savedBindPos;

    return result;
  }

  /**
   * Collects all declared-var names referenced inside a sub-module's reactive bindings
   * plus any identifiers from an optional extra AST expression node (e.g. the @if condition
   * or @for iterable expression).
   */
  private collectDepsFromSubModule(
    subMod: { reactiveBindings: ReactiveBinding[] },
    extraExpr?: any
  ): string[] {
    const deps = new Set<string>(subMod.reactiveBindings.map((b) => b.variable));
    if (extraExpr) {
      for (const name of this.extractIdentifiers(extraExpr)) {
        if (this.declaredVars.has(name)) deps.add(name);
      }
    }
    return [...deps];
  }

  private compileIfNode(node: IfNode, parentReg: number): void {
    // Build consequent sub-module
    const consMod = this.compileNodesToSubModule(node.consequent);
    const consIdx = this.addConstant(consMod);

    // Build alternate sub-module (may be @else or @else if)
    let altIdx = 0xFF;
    let altMod: any = null;
    if (node.alternate !== null) {
      let altNodes: readonly TemplateChildNode[];
      if (Array.isArray(node.alternate)) {
        altNodes = node.alternate;
      } else {
        // @else if: wrap the nested IfNode so it compiles correctly inside a sub-module
        altNodes = [node.alternate as TemplateChildNode];
      }
      altMod = this.compileNodesToSubModule(altNodes);
      altIdx = this.addConstant(altMod);
    }

    // Deps = union of both branches' reactive vars + condition identifiers + optional extraDeps
    const depsSet = new Set<string>(this.collectDepsFromSubModule(consMod, node.test));
    if ((node as any).extraDeps) {
      for (const name of this.extractIdentifiers((node as any).extraDeps)) {
        if (this.declaredVars.has(name)) depsSet.add(name);
      }
      const depsArr = Array.from(depsSet);
      if (consMod.constants && !consMod.constants.some((c: any) => Array.isArray(c))) {
        consMod.constants.push(depsArr);
      }
    }
    if (altMod) {
      for (const dep of this.collectDepsFromSubModule(altMod)) {
        depsSet.add(dep);
      }
    }
    const depsIdx = this.addConstant(Array.from(depsSet));

    const condIdx = this.addConstant(node.test);

    // REACTIVE_IF parentReg condIdx consIdx altIdx depsIdx  (5 operand bytes)
    this.emit(Opcode.REACTIVE_IF, parentReg, condIdx, consIdx, altIdx, depsIdx);
  }

  private compileForNode(node: ForNode, parentReg: number): void {
    // Build body sub-module
    const bodyMod = this.compileNodesToSubModule(node.body);
    const bodyIdx = this.addConstant(bodyMod);

    const iterIdx = this.addConstant(node.iterable);
    const itemNameIdx = this.addConstant(node.item);
    const indexNameIdx = node.index !== null ? this.addConstant(node.index) : 0xFF;
    const keyIdx = node.key ? this.addConstant(node.key) : 0xFF;

    // Deps = body's reactive vars + identifiers from iterable expression
    const deps = this.collectDepsFromSubModule(bodyMod, node.iterable);
    const depsIdx = this.addConstant(deps);

    // REACTIVE_FOR parentReg iterIdx itemNameIdx indexNameIdx keyIdx bodyIdx depsIdx
    this.emit(Opcode.REACTIVE_FOR, parentReg, iterIdx, itemNameIdx, indexNameIdx, keyIdx, bodyIdx, depsIdx);
  }

  private collectDeclaredVars(nodes: readonly TemplateChildNode[]): void {
    for (const node of nodes) {
      if (node.type === ASTNodeType.Element && node.tagName === 'script') {
        for (const child of node.children) {
          if (child.type === ASTNodeType.Text && typeof child.content === 'object' && child.content !== null) {
            const astNode = child.content as any;
            if (Array.isArray(astNode)) {
              for (const stmt of astNode) {
                this.extractVarNames(stmt);
              }
            } else {
              this.extractVarNames(astNode);
            }
          }
        }
      }
    }
  }

  private extractVarNames(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        for (const name of extractBindingNames(decl.id)) {
          this.declaredVars.add(name);
        }
        if (
          decl.id?.type === 'Identifier' &&
          decl.init?.type === 'CallExpression' &&
          decl.init.callee?.type === 'Identifier' &&
          decl.init.callee.name === 'derive' &&
          decl.init.arguments &&
          decl.init.arguments.length > 0
        ) {
          this.pendingDerived.push({ name: decl.id.name, arg: decl.init.arguments[0] });
        }
      }
    } else if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id?.type === 'Identifier') {
      this.declaredVars.add(node.id.name);
    } else if (node.type === 'ImportDeclaration' && Array.isArray(node.specifiers)) {
      const source = typeof node.source?.value === 'string' ? node.source.value : '';
      if (node.specifiers.length === 0) {
        this.imports.push({ localName: '', source, isDefault: false, isSideEffect: true });
      } else {
        for (const spec of node.specifiers) {
          if (spec.local?.type === 'Identifier') {
            const localName = spec.local.name;
            this.declaredVars.add(localName);
            const isDefault = spec.type === 'ImportDefaultSpecifier';
            const isNamespace = spec.type === 'ImportNamespaceSpecifier';
            const importedName = spec.type === 'ImportSpecifier' && spec.imported?.type === 'Identifier'
              ? spec.imported.name
              : undefined;
            this.imports.push({ localName, source, isDefault, isNamespace, importedName });
          }
        }
      }
    }
  }

  private processDerivedBindings(): void {
    for (const item of this.pendingDerived) {
      const { name, arg } = item;
      let exprAST = arg;
      let isFunctionBlock = false;

      if (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') {
        if (arg.body?.type === 'BlockStatement') {
          isFunctionBlock = true;
          exprAST = arg.body;
        } else {
          exprAST = arg.body;
        }
      }

      const ids = this.extractIdentifiers(exprAST);
      const deps = [...ids].filter((id) => id !== name && this.declaredVars.has(id));

      const codeStr = astToJS(exprAST);
      let fnVal: any;
      if (isFunctionBlock) {
        fnVal = {
          __drift_fn__: `(scope, declaredVars, setScopeValue, inScopeChain, resolveIterable, _get) => ${codeStr}`
        };
      } else {
        fnVal = {
          __drift_fn__: `(scope, declaredVars, setScopeValue, inScopeChain, resolveIterable, _get) => (${codeStr})`
        };
      }

      const exprIdx = this.addConstant(fnVal);
      this.derivedBindings.push({ name, deps, exprIdx });
    }
  }

  private extractIdentifiers(node: any): Set<string> {
    const ids = new Set<string>();
    if (!node || typeof node !== 'object') return ids;

    try {
      walk.ancestor(node, {
        Identifier(idNode: any, ancestors: any[]) {
          const parent = ancestors[ancestors.length - 2];
          if (parent) {
            if (parent.type === 'MemberExpression' && parent.property === idNode && !parent.computed) {
              return;
            }
            if (
              (parent.type === 'Property' ||
                parent.type === 'MethodDefinition' ||
                parent.type === 'PropertyDefinition') &&
              parent.key === idNode &&
              !parent.computed
            ) {
              return;
            }
          }
          ids.add(idNode.name);
        },
      });
    } catch {
      // Ignored for partial/incomplete AST nodes
    }

    return ids;
  }

  private recordBindingPositions(expr: any, pc: number, opcode: Opcode): void {
    if (this.declaredVars.size === 0) return;
    const ids = this.extractIdentifiers(expr);
    for (const name of ids) {
      if (this.declaredVars.has(name)) {
        if (!this.bindingPositions.has(name)) {
          this.bindingPositions.set(name, []);
        }
        this.bindingPositions.get(name)!.push({ pc, opcode });
      }
    }
  }

  private buildReactiveBindings(): ReactiveBinding[] {
    const bindings: ReactiveBinding[] = [];
    for (const [variable, positions] of this.bindingPositions) {
      bindings.push({ variable, positions });
    }
    return bindings;
  }

  private allocRegister(): number {
    return this.nextRegisterId++;
  }

  private addConstant(value: any): number {
    if (value && typeof value === 'object' && value.type && typeof value.type === 'string') {
      const codeStr = astToJS(value);
      value = { __drift_fn__: `(scope, declaredVars, setScopeValue, inScopeChain, resolveIterable, _get) => (${codeStr})` };
    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0]?.type) {
      const codeStr = astToJS(value);
      value = { __drift_fn__: `(scope, declaredVars, setScopeValue, inScopeChain, resolveIterable, _get) => { ${codeStr}; }` };
    }

    const existingIndex = this.constants.findIndex((c) => this.isConstantEqual(c, value));
    if (existingIndex !== -1) {
      return existingIndex;
    }

    this.constants.push(value);
    return this.constants.length - 1;
  }

  private isConstantEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }

  private emit(opcode: Opcode, ...operands: number[]): void {
    this.bytecode.push(opcode, ...operands);
  }
}

function getRootIdentifier(node: any): string | null {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return getRootIdentifier(node.object);
  return null;
}

export function extractBindingNames(node: any): string[] {
  const names: string[] = [];
  function walk(n: any) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'Identifier') names.push(n.name);
    else if (n.type === 'ObjectPattern' && Array.isArray(n.properties)) {
      for (const p of n.properties) {
        if (p.type === 'Property') walk(p.value);
        else if (p.type === 'RestElement') walk(p.argument);
      }
    } else if (n.type === 'ArrayPattern' && Array.isArray(n.elements)) {
      for (const e of n.elements) if (e) walk(e);
    } else if (n.type === 'AssignmentPattern') {
      walk(n.left);
    } else if (n.type === 'RestElement') {
      walk(n.argument);
    }
  }
  walk(node);
  return names;
}

function paramToJS(node: any, outerLocals?: Set<string>): string {
  if (!node) return '';
  switch (node.type) {
    case 'Identifier':
      return node.name;
    case 'AssignmentPattern':
      return `${paramToJS(node.left, outerLocals)} = ${astToJS(node.right, outerLocals)}`;
    case 'RestElement':
      return `...${paramToJS(node.argument, outerLocals)}`;
    case 'ArrayPattern':
      return `[${(node.elements || []).map((el: any) => (el ? paramToJS(el, outerLocals) : '')).join(', ')}]`;
    case 'ObjectPattern': {
      const props = (node.properties || [])
        .map((p: any) => {
          if (p.type === 'Property') {
            const k = p.key?.name || (typeof p.key?.value === 'string' ? JSON.stringify(p.key.value) : p.key?.value ? String(p.key.value) : astToJS(p.key, outerLocals));
            if (p.value?.type === 'AssignmentPattern') {
              const leftName = p.value.left?.name || paramToJS(p.value.left, outerLocals);
              const rightJS = astToJS(p.value.right, outerLocals);
              return (k === leftName || p.shorthand) ? `${k} = ${rightJS}` : `${k}: ${leftName} = ${rightJS}`;
            } else if (p.value?.type === 'Identifier' && p.value.name === k) {
              return k;
            } else {
              return `${k}: ${paramToJS(p.value, outerLocals)}`;
            }
          } else if (p.type === 'RestElement') {
            return `...${paramToJS(p.argument, outerLocals)}`;
          }
          return '';
        })
        .filter(Boolean)
        .join(', ');
      return `{ ${props} }`;
    }
    default:
      return node.name || astToJS(node, outerLocals);
  }
}

function emitAssign(varName: string, expr: string, locals?: Set<string>): string {
  if (locals && locals.has(varName)) {
    return `(${varName} = ${expr})`;
  }
  return `(typeof setScopeValue === 'function' && scope ? setScopeValue(scope, ${JSON.stringify(varName)}, ${expr}) : ((scope || {})[${JSON.stringify(varName)}] = ${expr}))`;
}

function generatePatternAssignments(
  pattern: any,
  sourceVar: string,
  locals?: Set<string>,
  tmpCounterRef = { count: 0 }
): string[] {
  const stmts: string[] = [];
  if (!pattern) return stmts;

  if (pattern.type === 'Identifier') {
    stmts.push(emitAssign(pattern.name, sourceVar, locals));
    return stmts;
  }

  if (pattern.type === 'AssignmentPattern') {
    const defaultVal = astToJS(pattern.right, locals);
    const valExpr = `((${sourceVar} !== undefined) ? ${sourceVar} : ${defaultVal})`;
    if (pattern.left?.type === 'Identifier') {
      stmts.push(emitAssign(pattern.left.name, valExpr, locals));
    } else {
      const tmp = `_t${tmpCounterRef.count++}`;
      stmts.push(`const ${tmp} = ${valExpr}`);
      stmts.push(...generatePatternAssignments(pattern.left, tmp, locals, tmpCounterRef));
    }
    return stmts;
  }

  if (pattern.type === 'ObjectPattern') {
    for (const prop of (pattern.properties || [])) {
      if (prop.type === 'Property') {
        const isComputed = Boolean(prop.computed);
        const keyExpr = isComputed
          ? astToJS(prop.key, locals)
          : (prop.key?.name !== undefined
              ? JSON.stringify(prop.key.name)
              : (typeof prop.key?.value === 'string' || typeof prop.key?.value === 'number'
                  ? JSON.stringify(prop.key.value)
                  : astToJS(prop.key, locals)));

        if (prop.value?.type === 'Identifier') {
          const expr = `(${sourceVar} ? ${sourceVar}[${keyExpr}] : undefined)`;
          stmts.push(emitAssign(prop.value.name, expr, locals));
        } else if (prop.value?.type === 'AssignmentPattern') {
          const defaultVal = astToJS(prop.value.right, locals);
          const valExpr = `((${sourceVar} && ${sourceVar}[${keyExpr}] !== undefined) ? ${sourceVar}[${keyExpr}] : ${defaultVal})`;
          if (prop.value.left?.type === 'Identifier') {
            stmts.push(emitAssign(prop.value.left.name, valExpr, locals));
          } else {
            const tmp = `_t${tmpCounterRef.count++}`;
            stmts.push(`const ${tmp} = ${valExpr}`);
            stmts.push(...generatePatternAssignments(prop.value.left, tmp, locals, tmpCounterRef));
          }
        } else if (prop.value?.type === 'ObjectPattern' || prop.value?.type === 'ArrayPattern') {
          const tmp = `_t${tmpCounterRef.count++}`;
          const valExpr = `(${sourceVar} ? ${sourceVar}[${keyExpr}] : undefined)`;
          stmts.push(`const ${tmp} = ${valExpr}`);
          stmts.push(...generatePatternAssignments(prop.value, tmp, locals, tmpCounterRef));
        } else {
          const varName = prop.value?.name || astToJS(prop.value, locals);
          if (varName) {
            const expr = `(${sourceVar} ? ${sourceVar}[${keyExpr}] : undefined)`;
            stmts.push(emitAssign(varName, expr, locals));
          }
        }
      } else if (prop.type === 'RestElement') {
        const varName = prop.argument?.name || astToJS(prop.argument, locals);
        if (varName) {
          const knownKeys = (pattern.properties || [])
            .filter((p: any) => p.type === 'Property')
            .map((p: any) => p.key?.name || (typeof p.key?.value === 'string' ? p.key.value : ''))
            .filter(Boolean);
          const expr = `(() => { const _r = Object.assign({}, ${sourceVar}); ${JSON.stringify(knownKeys)}.forEach(k => delete _r[k]); return _r; })()`;
          stmts.push(emitAssign(varName, expr, locals));
        }
      }
    }
    return stmts;
  }

  if (pattern.type === 'ArrayPattern') {
    const tmpArr = `_a${tmpCounterRef.count++}`;
    stmts.push(`const ${tmpArr} = (typeof resolveIterable === 'function' ? resolveIterable(${sourceVar}) : (${sourceVar} || []))`);
    const elems = pattern.elements || [];
    for (let i = 0; i < elems.length; i++) {
      const el = elems[i];
      if (!el) continue;
      if (el.type === 'Identifier') {
        const expr = `(${tmpArr} ? ${tmpArr}[${i}] : undefined)`;
        stmts.push(emitAssign(el.name, expr, locals));
      } else if (el.type === 'AssignmentPattern') {
        const defaultVal = astToJS(el.right, locals);
        const valExpr = `((${tmpArr} && ${tmpArr}[${i}] !== undefined) ? ${tmpArr}[${i}] : ${defaultVal})`;
        if (el.left?.type === 'Identifier') {
          stmts.push(emitAssign(el.left.name, valExpr, locals));
        } else {
          const tmp = `_t${tmpCounterRef.count++}`;
          stmts.push(`const ${tmp} = ${valExpr}`);
          stmts.push(...generatePatternAssignments(el.left, tmp, locals, tmpCounterRef));
        }
      } else if (el.type === 'RestElement') {
        const varName = el.argument?.name || astToJS(el.argument, locals);
        if (varName) {
          const expr = `((${tmpArr} && typeof ${tmpArr}.slice === 'function') ? ${tmpArr}.slice(${i}) : [])`;
          stmts.push(emitAssign(varName, expr, locals));
        }
      } else if (el.type === 'ObjectPattern' || el.type === 'ArrayPattern') {
        const tmp = `_t${tmpCounterRef.count++}`;
        const valExpr = `(${tmpArr} ? ${tmpArr}[${i}] : undefined)`;
        stmts.push(`const ${tmp} = ${valExpr}`);
        stmts.push(...generatePatternAssignments(el, tmp, locals, tmpCounterRef));
      }
    }
    return stmts;
  }

  return stmts;
}

/**
 * Converts Acorn AST nodes or arrays of statements into valid JavaScript source code strings.
 */
export function astToJS(node: any, locals?: Set<string>): string {
  if (node === null || node === undefined) return 'undefined';
  if (typeof node !== 'object') return typeof node === 'string' ? JSON.stringify(node) : String(node);
  if (Array.isArray(node)) return node.map((n) => astToJS(n, locals)).join('; ');

  switch (node.type) {
    case 'Identifier':
      if (locals && locals.has(node.name)) return node.name;
      return `(typeof _get === 'function' ? _get(scope, ${JSON.stringify(node.name)}) : (typeof inScopeChain === 'function' && inScopeChain(scope, ${JSON.stringify(node.name)}) ? scope[${JSON.stringify(node.name)}] : (typeof globalThis !== 'undefined' && globalThis && (${JSON.stringify(node.name)} in globalThis) ? globalThis[${JSON.stringify(node.name)}] : (scope || {})[${JSON.stringify(node.name)}])))`;

    case 'Literal':
      if (typeof node.raw === 'string') return node.raw;
      return typeof node.value === 'string' ? JSON.stringify(node.value) : String(node.value);

    case 'BinaryExpression':
    case 'LogicalExpression':
      return `(${astToJS(node.left, locals)} ${node.operator} ${astToJS(node.right, locals)})`;

    case 'UnaryExpression':
      return `(${node.operator} ${astToJS(node.argument, locals)})`;

    case 'AwaitExpression':
      return `(await ${astToJS(node.argument, locals)})`;

    case 'YieldExpression':
      return node.delegate
        ? `(yield* ${node.argument ? astToJS(node.argument, locals) : ''})`
        : `(yield ${node.argument ? astToJS(node.argument, locals) : ''})`;

    case 'ConditionalExpression':
      return `(${astToJS(node.test, locals)} ? ${astToJS(node.consequent, locals)} : ${astToJS(node.alternate, locals)})`;

    case 'MemberExpression': {
      const opt = node.optional ? '?.' : '.';
      return node.computed
        ? (node.optional ? `(${astToJS(node.object, locals)}?.[${astToJS(node.property, locals)}])` : `(${astToJS(node.object, locals)}[${astToJS(node.property, locals)}])`)
        : `(${astToJS(node.object, locals)}${opt}${node.property.name})`;
    }

    case 'CallExpression': {
      const calleeJS = astToJS(node.callee, locals);
      const argsJS = node.arguments ? node.arguments.map((arg: any) => astToJS(arg, locals)).join(', ') : '';
      const optCall = node.optional ? '?.(' : '(';
      const rawCall = `(${calleeJS}${optCall}${argsJS}))`;
      if (
        node.callee?.type === 'MemberExpression' &&
        node.callee.property?.type === 'Identifier'
      ) {
        const rootObjName = getRootIdentifier(node.callee.object);
        const methodName = node.callee.property.name;
        const arrayMutators = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];
        if (rootObjName && arrayMutators.includes(methodName) && (!locals || !locals.has(rootObjName))) {
          return `(() => { const _res = ${rawCall}; if (typeof setScopeValue === 'function' && scope && typeof inScopeChain === 'function' && inScopeChain(scope, ${JSON.stringify(rootObjName)})) setScopeValue(scope, ${JSON.stringify(rootObjName)}, scope[${JSON.stringify(rootObjName)}]); return _res; })()`;
        }
      }
      return rawCall;
    }

    case 'AssignmentExpression': {
      const valJS = astToJS(node.right, locals);
      if (node.left?.type === 'Identifier') {
        const name = node.left.name;
        if (locals && locals.has(name)) {
          return `(${name} ${node.operator} ${valJS})`;
        }
        if (node.operator === '=') {
          return `(typeof setScopeValue === 'function' ? setScopeValue(scope, ${JSON.stringify(name)}, ${valJS}) : ((scope || {})[${JSON.stringify(name)}] = ${valJS}))`;
        } else {
          const op = node.operator.slice(0, -1);
          return `(typeof setScopeValue === 'function' ? setScopeValue(scope, ${JSON.stringify(name)}, (scope[${JSON.stringify(name)}] ${op} ${valJS})) : ((scope || {})[${JSON.stringify(name)}] ${node.operator} ${valJS}))`;
        }
      }
      if (node.left?.type === 'MemberExpression') {
        const rootName = getRootIdentifier(node.left);
        const rawAssign = `(${astToJS(node.left, locals)} ${node.operator} ${valJS})`;
        if (rootName && (!locals || !locals.has(rootName))) {
          return `(() => { const _res = ${rawAssign}; if (typeof setScopeValue === 'function' && scope && typeof inScopeChain === 'function' && inScopeChain(scope, ${JSON.stringify(rootName)})) setScopeValue(scope, ${JSON.stringify(rootName)}, scope[${JSON.stringify(rootName)}]); return _res; })()`;
        }
      }
      if (node.left?.type === 'ObjectPattern' || node.left?.type === 'ArrayPattern') {
        const setCalls = generatePatternAssignments(node.left, '_val', locals);
        return `((_val) => { ${setCalls.join('; ')}; return _val; })(${valJS})`;
      }
      return `(${astToJS(node.left, locals)} ${node.operator} ${valJS})`;
    }


    case 'UpdateExpression': {
      if (node.argument?.type === 'Identifier') {
        const name = node.argument.name;
        if (locals && locals.has(name)) {
          return node.prefix ? `(${node.operator}${name})` : `(${name}${node.operator})`;
        }
        const op = node.operator === '++' ? '+' : '-';
        if (node.prefix) {
          return `(typeof setScopeValue === 'function' ? (setScopeValue(scope, ${JSON.stringify(name)}, (Number(scope[${JSON.stringify(name)}]) || 0) ${op} 1), scope[${JSON.stringify(name)}]) : ((scope || {})[${JSON.stringify(name)}] = (Number((scope || {})[${JSON.stringify(name)}]) || 0) ${op} 1))`;
        } else {
          return `(() => { const _v = Number(scope[${JSON.stringify(name)}]) || 0; if (typeof setScopeValue === 'function') setScopeValue(scope, ${JSON.stringify(name)}, _v ${op} 1); else (scope || {})[${JSON.stringify(name)}] = _v ${op} 1; return _v; })()`;
        }
      }
      if (node.argument?.type === 'MemberExpression') {
        const rootName = getRootIdentifier(node.argument);
        const rawUpdate = node.prefix
          ? `(${node.operator}${astToJS(node.argument, locals)})`
          : `(${astToJS(node.argument, locals)}${node.operator})`;
        if (rootName && (!locals || !locals.has(rootName))) {
          return `(() => { const _res = ${rawUpdate}; if (typeof setScopeValue === 'function' && scope && typeof inScopeChain === 'function' && inScopeChain(scope, ${JSON.stringify(rootName)})) setScopeValue(scope, ${JSON.stringify(rootName)}, scope[${JSON.stringify(rootName)}]); return _res; })()`;
        }
      }
      return node.prefix
        ? `(${node.operator}${astToJS(node.argument, locals)})`
        : `(${astToJS(node.argument, locals)}${node.operator})`;
    }

    case 'SequenceExpression':
      return `(${node.expressions ? node.expressions.map((e: any) => astToJS(e, locals)).join(', ') : ''})`;

    case 'ArrayExpression':
      return `[${node.elements ? node.elements.map((el: any) => el?.type === 'SpreadElement' ? '...' + astToJS(el.argument, locals) : astToJS(el, locals)).join(', ') : ''}]`;

    case 'ObjectExpression':
      return `{${node.properties ? node.properties.map((prop: any) => {
        if (prop.type === 'SpreadElement') {
          return '...' + astToJS(prop.argument, locals);
        }
        const keyJS = prop.computed
          ? `[${astToJS(prop.key, locals)}]`
          : (prop.key?.name || (typeof prop.key?.value === 'string' ? JSON.stringify(prop.key.value) : String(prop.key?.value ?? '')));

        if (prop.kind === 'get' || prop.kind === 'set') {
          const fn = prop.value;
          const newLocals = new Set(locals);
          const paramNames: string[] = [];
          if (fn.params) {
            for (const p of fn.params) {
              for (const pName of extractBindingNames(p)) {
                newLocals.add(pName);
              }
              paramNames.push(paramToJS(p, newLocals));
            }
          }
          const bodyCode = fn.body?.type === 'BlockStatement'
            ? `{ ${fn.body.body.map((s: any) => astToJS(s, newLocals)).filter(Boolean).join('; ')}; }`
            : `{ ${astToJS(fn.body, newLocals)}; }`;
          return `${prop.kind} ${keyJS}(${paramNames.join(', ')}) ${bodyCode}`;
        }

        if (prop.method) {
          const fn = prop.value;
          const newLocals = new Set(locals);
          const paramNames: string[] = [];
          if (fn.params) {
            for (const p of fn.params) {
              for (const pName of extractBindingNames(p)) {
                newLocals.add(pName);
              }
              paramNames.push(paramToJS(p, newLocals));
            }
          }
          const asyncPrefix = fn.async ? 'async ' : '';
          const generatorStar = fn.generator ? '*' : '';
          const bodyCode = fn.body?.type === 'BlockStatement'
            ? `{ ${fn.body.body.map((s: any) => astToJS(s, newLocals)).filter(Boolean).join('; ')}; }`
            : `{ ${astToJS(fn.body, newLocals)}; }`;
          return `${asyncPrefix}${generatorStar}${keyJS}(${paramNames.join(', ')}) ${bodyCode}`;
        }

        return `${keyJS}: ${astToJS(prop.value, locals)}`;
      }).join(', ') : ''}}`;

    case 'RestElement':
    case 'SpreadElement':
      return `...${astToJS(node.argument, locals)}`;

    case 'AssignmentPattern':
      return `${astToJS(node.left, locals)} = ${astToJS(node.right, locals)}`;

    case 'TemplateLiteral':
      return `\`${node.quasis ? node.quasis.map((q: any, i: number) => (q.value?.raw ?? '') + (node.expressions && node.expressions[i] ? '\${' + astToJS(node.expressions[i], locals) + '}' : '')).join('') : ''}\``;

    case 'TaggedTemplateExpression': {
      const tagJS = astToJS(node.tag, locals);
      const quasiJS = astToJS(node.quasi, locals);
      return `${tagJS}${quasiJS}`;
    }

    case 'ThisExpression':
      return 'this';

    case 'Super':
      return 'super';

    case 'BlockStatement': {
      const newLocals = new Set(locals);
      if (Array.isArray(node.body)) {
        for (const stmt of node.body) {
          if (stmt.type === 'VariableDeclaration' && Array.isArray(stmt.declarations)) {
            for (const d of stmt.declarations) {
              for (const varName of extractBindingNames(d.id)) {
                newLocals.add(varName);
              }
            }
          } else if (stmt.type === 'FunctionDeclaration' && stmt.id?.name) {
            newLocals.add(stmt.id.name);
          }
        }
      }
      const stmts = node.body ? node.body.map((stmt: any) => astToJS(stmt, newLocals)).filter(Boolean) : [];
      // Emit as a real block `{ }` so that `return`/`break`/`continue` inside are valid statements.
      return `{ ${stmts.join('; ')}; }`;
    }

    case 'ExpressionStatement':
      return astToJS(node.expression, locals);

    case 'ReturnStatement':
      return `return ${node.argument ? astToJS(node.argument, locals) : ''}`;

    case 'ThrowStatement':
      return `throw ${node.argument ? astToJS(node.argument, locals) : ''}`;

    case 'BreakStatement':
      return node.label ? `break ${node.label.name}` : 'break';

    case 'ContinueStatement':
      return node.label ? `continue ${node.label.name}` : 'continue';

    case 'LabeledStatement':
      return `${node.label.name}: ${astToJS(node.body, locals)}`;

    case 'TryStatement': {
      const blockJS = astToJS(node.block, locals);
      const handlerJS = node.handler ? astToJS(node.handler, locals) : '';
      const finalizerJS = node.finalizer ? `finally ${astToJS(node.finalizer, locals)}` : '';
      return `try ${blockJS} ${handlerJS} ${finalizerJS}`.trim();
    }

    case 'CatchClause': {
      const newLocals = new Set(locals);
      let paramJS = '';
      if (node.param) {
        for (const name of extractBindingNames(node.param)) {
          newLocals.add(name);
        }
        paramJS = paramToJS(node.param, newLocals);
      }
      const bodyJS = astToJS(node.body, newLocals);
      return paramJS ? `catch (${paramJS}) ${bodyJS}` : `catch ${bodyJS}`;
    }

    case 'SwitchStatement': {
      const discJS = astToJS(node.discriminant, locals);
      const casesJS = node.cases ? node.cases.map((c: any) => astToJS(c, locals)).join(' ') : '';
      return `switch (${discJS}) { ${casesJS} }`;
    }

    case 'SwitchCase': {
      const testJS = node.test ? `case ${astToJS(node.test, locals)}:` : 'default:';
      const stmtsJS = node.consequent ? node.consequent.map((s: any) => astToJS(s, locals)).filter(Boolean).join('; ') : '';
      return `${testJS} ${stmtsJS ? stmtsJS + ';' : ''}`;
    }

    case 'IfStatement': {
      // Emit a real if/else statement (not a ternary) so that `return`, `break`,
      // and `continue` inside branches are valid in their enclosing function/loop.
      const testJS = astToJS(node.test, locals);
      const consJS = node.consequent.type === 'BlockStatement'
        ? astToJS(node.consequent, locals)
        : `{ ${astToJS(node.consequent, locals)}; }`;
      const altJS = node.alternate
        ? ` else ${node.alternate.type === 'BlockStatement' || node.alternate.type === 'IfStatement'
            ? astToJS(node.alternate, locals)
            : `{ ${astToJS(node.alternate, locals)}; }`}`
        : '';
      return `if (${testJS}) ${consJS}${altJS}`;
    }

    case 'ForStatement': {
      const newLocals = new Set(locals);
      if (node.init?.type === 'VariableDeclaration' && node.init.declarations) {
        for (const d of node.init.declarations) {
          for (const varName of extractBindingNames(d.id)) {
            newLocals.add(varName);
          }
        }
      }
      let initJS = '';
      if (node.init?.type === 'VariableDeclaration' && node.init.declarations) {
        initJS = (node.init.kind || 'let') + ' ' + node.init.declarations.map((d: any) => {
          const idJS = d.id?.type === 'Identifier' ? d.id.name : astToJS(d.id, newLocals);
          return `${idJS}${d.init ? ` = ${astToJS(d.init, newLocals)}` : ''}`;
        }).join(', ');
      } else if (node.init) {
        initJS = astToJS(node.init, newLocals);
      }
      const testJS = node.test ? astToJS(node.test, newLocals) : '';
      const updateJS = node.update ? astToJS(node.update, newLocals) : '';
      const bodyJS = node.body?.type === 'BlockStatement'
        ? astToJS(node.body, newLocals)
        : `{ ${node.body ? astToJS(node.body, newLocals) : ''}; }`;
      return `for (${initJS}; ${testJS}; ${updateJS}) ${bodyJS}`;
    }

    case 'ForOfStatement': {
      const newLocals = new Set(locals);
      let leftJS = '';
      if (node.left?.type === 'VariableDeclaration') {
        const kind = node.left.kind || 'let';
        const decl = node.left.declarations?.[0];
        if (decl) {
          for (const varName of extractBindingNames(decl.id)) {
            newLocals.add(varName);
          }
          const idJS = decl.id?.type === 'Identifier' ? decl.id.name : astToJS(decl.id, newLocals);
          leftJS = `${kind} ${idJS}`;
        }
      } else if (node.left?.type === 'Identifier') {
        newLocals.add(node.left.name);
        leftJS = node.left.name;
      } else if (node.left) {
        leftJS = astToJS(node.left, newLocals);
      }
      const rightExpr = astToJS(node.right, locals);
      const rightJS = `(typeof resolveIterable === 'function' ? resolveIterable : (x) => x || [])(${rightExpr})`;
      const bodyJS = node.body?.type === 'BlockStatement'
        ? astToJS(node.body, newLocals)
        : `{ ${node.body ? astToJS(node.body, newLocals) : ''}; }`;
      const awaitPrefix = node.await ? 'await ' : '';
      return `for ${awaitPrefix}(${leftJS} of ${rightJS}) ${bodyJS}`;
    }

    case 'ForInStatement': {
      const newLocals = new Set(locals);
      let leftJS = '';
      if (node.left?.type === 'VariableDeclaration') {
        const kind = node.left.kind || 'let';
        const decl = node.left.declarations?.[0];
        if (decl) {
          for (const varName of extractBindingNames(decl.id)) {
            newLocals.add(varName);
          }
          const idJS = decl.id?.type === 'Identifier' ? decl.id.name : astToJS(decl.id, newLocals);
          leftJS = `${kind} ${idJS}`;
        }
      } else if (node.left?.type === 'Identifier') {
        newLocals.add(node.left.name);
        leftJS = node.left.name;
      } else if (node.left) {
        leftJS = astToJS(node.left, newLocals);
      }
      const rightJS = astToJS(node.right, locals);
      const bodyJS = node.body?.type === 'BlockStatement'
        ? astToJS(node.body, newLocals)
        : `{ ${node.body ? astToJS(node.body, newLocals) : ''}; }`;
      return `for (${leftJS} in ${rightJS}) ${bodyJS}`;
    }

    case 'WhileStatement': {
      const testJS = astToJS(node.test, locals);
      const bodyJS = node.body?.type === 'BlockStatement'
        ? astToJS(node.body, locals)
        : `{ ${node.body ? astToJS(node.body, locals) : ''}; }`;
      return `while (${testJS}) ${bodyJS}`;
    }

    case 'DoWhileStatement': {
      const testJS = astToJS(node.test, locals);
      const bodyJS = node.body?.type === 'BlockStatement'
        ? astToJS(node.body, locals)
        : `{ ${node.body ? astToJS(node.body, locals) : ''}; }`;
      return `do ${bodyJS} while (${testJS})`;
    }

    case 'ArrayPattern': {
      const elemsJS = node.elements
        ? node.elements.map((el: any) => el ? (el.type === 'RestElement' ? '...' + astToJS(el.argument, locals) : (el.type === 'AssignmentPattern' ? `${astToJS(el.left, locals)} = ${astToJS(el.right, locals)}` : (el.name || astToJS(el, locals)))) : '').join(', ')
        : '';
      return `[ ${elemsJS} ]`;
    }

    case 'ObjectPattern': {
      const propsJS = node.properties ? node.properties.map((p: any) => {
        if (p.type === 'Property') {
          const k = p.key?.name || astToJS(p.key, locals);
          const v = p.value?.name || astToJS(p.value, locals);
          return k === v ? k : `${k}: ${v}`;
        }
        if (p.type === 'RestElement') {
          return `...${astToJS(p.argument, locals)}`;
        }
        return '';
      }).filter(Boolean).join(', ') : '';
      return `{ ${propsJS} }`;
    }

    case 'VariableDeclaration': {
      if (locals) {
        const declsArr: string[] = [];
        if (node.declarations) {
          for (const d of node.declarations) {
            const idJS = d.id?.type === 'Identifier' ? d.id.name : astToJS(d.id, locals);
            const valJS = d.init ? astToJS(d.init, locals) : undefined;
            if (valJS !== undefined) {
              declsArr.push(`${idJS} = ${valJS}`);
            } else {
              declsArr.push(`${idJS}`);
            }
          }
        }
        return `${node.kind || 'let'} ${declsArr.join(', ')}`;
      }

      const declsArr: string[] = [];
      if (node.declarations) {
        for (const d of node.declarations) {
          if (d.id?.type === 'ObjectPattern' || d.id?.type === 'ArrayPattern') {
            const valJS = d.init ? astToJS(d.init, locals) : 'undefined';
            const setCalls = generatePatternAssignments(d.id, '_init', locals);
            declsArr.push(`((_init) => { ${setCalls.join('; ')}; return _init; })(${valJS})`);
          } else {
            const name = d.id?.name || astToJS(d.id, locals);
            const valJS = d.init ? astToJS(d.init, locals) : 'undefined';
            declsArr.push(`((scope || {})[${JSON.stringify(name)}] = ${valJS})`);
          }
        }
      }
      return `(${declsArr.filter(Boolean).join(', ') || 'undefined'})`;
    }

    case 'FunctionDeclaration': {
      const name = node.id?.name;
      const newLocals = new Set(locals);
      if (name) newLocals.add(name);
      const paramNames: string[] = [];
      if (node.params) {
        for (const p of node.params) {
          for (const pName of extractBindingNames(p)) {
            newLocals.add(pName);
          }
          paramNames.push(paramToJS(p, newLocals));
        }
      }
      if (node.body?.type === 'BlockStatement' && Array.isArray(node.body.body)) {
        for (const stmt of node.body.body) {
          if (stmt.type === 'VariableDeclaration' && Array.isArray(stmt.declarations)) {
            for (const d of stmt.declarations) {
              for (const varName of extractBindingNames(d.id)) {
                newLocals.add(varName);
              }
            }
          } else if (stmt.type === 'FunctionDeclaration' && stmt.id?.name) {
            newLocals.add(stmt.id.name);
          }
        }
      }
      const paramsJS = paramNames.join(', ');
      const bodyCode = node.body?.type === 'BlockStatement'
        ? `{ ${node.body.body.map((s: any) => astToJS(s, newLocals)).filter(Boolean).join('; ')}; }`
        : `{ ${astToJS(node.body, newLocals)}; }`;
      const asyncPrefix = node.async ? 'async ' : '';
      const generatorStar = node.generator ? '*' : '';
      const fnCode = `${asyncPrefix}function${generatorStar} ${name || ''}(${paramsJS}) ${bodyCode}`;
      if (name) {
        return `((scope || {})[${JSON.stringify(name)}] = ${fnCode})`;
      }
      return fnCode;
    }

    case 'ArrowFunctionExpression':
    case 'FunctionExpression': {
      const newLocals = new Set(locals);
      if (node.id?.name) newLocals.add(node.id.name);
      const paramNames: string[] = [];
      if (node.params) {
        for (const p of node.params) {
          for (const pName of extractBindingNames(p)) {
            newLocals.add(pName);
          }
          paramNames.push(paramToJS(p, newLocals));
        }
      }
      if (node.body?.type === 'BlockStatement' && Array.isArray(node.body.body)) {
        for (const stmt of node.body.body) {
          if (stmt.type === 'VariableDeclaration' && Array.isArray(stmt.declarations)) {
            for (const d of stmt.declarations) {
              for (const varName of extractBindingNames(d.id)) {
                newLocals.add(varName);
              }
            }
          } else if (stmt.type === 'FunctionDeclaration' && stmt.id?.name) {
            newLocals.add(stmt.id.name);
          }
        }
      }
      const paramsJS = paramNames.join(', ');
      const asyncPrefix = node.async ? 'async ' : '';
      if (node.type === 'ArrowFunctionExpression') {
        if (node.body?.type === 'BlockStatement') {
          const bodyCode = `{ ${node.body.body.map((s: any) => astToJS(s, newLocals)).filter(Boolean).join('; ')}; }`;
          return `(${asyncPrefix}(${paramsJS}) => ${bodyCode})`;
        }
        const bodyJS = astToJS(node.body, newLocals);
        return `(${asyncPrefix}(${paramsJS}) => ${bodyJS})`;
      } else {
        const generatorStar = node.generator ? '*' : '';
        const bodyCode = node.body?.type === 'BlockStatement'
          ? `{ ${node.body.body.map((s: any) => astToJS(s, newLocals)).filter(Boolean).join('; ')}; }`
          : `{ ${astToJS(node.body, newLocals)}; }`;
        return `(${asyncPrefix}function${generatorStar} ${node.id?.name || ''}(${paramsJS}) ${bodyCode})`;
      }
    }

    case 'ClassDeclaration':
    case 'ClassExpression': {
      const name = node.id?.name;
      const newLocals = new Set(locals);
      if (name) newLocals.add(name);
      const superJS = node.superClass ? ` extends ${astToJS(node.superClass, locals)}` : '';
      const bodyJS = astToJS(node.body, newLocals);
      const classCode = `class ${name || ''}${superJS} ${bodyJS}`;
      if (node.type === 'ClassDeclaration' && name) {
        return `((scope || {})[${JSON.stringify(name)}] = ${classCode})`;
      }
      return `(${classCode})`;
    }

    case 'ClassBody': {
      const elements = node.body ? node.body.map((el: any) => astToJS(el, locals)).filter(Boolean) : [];
      return `{ ${elements.join('; ')} }`;
    }

    case 'MethodDefinition': {
      const staticPrefix = node.static ? 'static ' : '';
      const kindPrefix = node.kind === 'get' || node.kind === 'set' ? `${node.kind} ` : '';
      const asyncPrefix = node.value?.async ? 'async ' : '';
      const genPrefix = node.value?.generator ? '*' : '';
      const keyJS = node.computed ? `[${astToJS(node.key, locals)}]` : (node.key?.name || astToJS(node.key, locals));
      const newLocals = new Set(locals);
      const paramNames: string[] = [];
      if (node.value?.params) {
        for (const p of node.value.params) {
          for (const pName of extractBindingNames(p)) {
            newLocals.add(pName);
          }
          paramNames.push(paramToJS(p, newLocals));
        }
      }
      if (node.value?.body?.type === 'BlockStatement' && Array.isArray(node.value.body.body)) {
        for (const stmt of node.value.body.body) {
          if (stmt.type === 'VariableDeclaration' && Array.isArray(stmt.declarations)) {
            for (const d of stmt.declarations) {
              for (const varName of extractBindingNames(d.id)) {
                newLocals.add(varName);
              }
            }
          } else if (stmt.type === 'FunctionDeclaration' && stmt.id?.name) {
            newLocals.add(stmt.id.name);
          }
        }
      }
      const paramsJS = paramNames.join(', ');
      const bodyCode = node.value?.body ? astToJS(node.value.body, newLocals) : '{}';
      return `${staticPrefix}${asyncPrefix}${genPrefix}${kindPrefix}${keyJS}(${paramsJS}) ${bodyCode}`;
    }

    case 'PropertyDefinition': {
      const staticPrefix = node.static ? 'static ' : '';
      const keyJS = node.computed ? `[${astToJS(node.key, locals)}]` : (node.key?.name || astToJS(node.key, locals));
      const valJS = node.value ? ` = ${astToJS(node.value, locals)}` : '';
      return `${staticPrefix}${keyJS}${valJS}`;
    }

    case 'NewExpression':
      return `new (${astToJS(node.callee, locals)})(${node.arguments ? node.arguments.map((a: any) => astToJS(a, locals)).join(', ') : ''})`;

    case 'EmptyStatement':
    case 'ImportDeclaration':
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
      return '';

    case 'ParenthesizedExpression':
    case 'ChainExpression':
      return astToJS(node.expression, locals);

    default:
      return '';
  }
}
