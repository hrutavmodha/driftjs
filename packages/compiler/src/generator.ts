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
  ImportSpec,
} from '../types/index.js';
import {
  ASTNodeType,
  Opcode,
} from '../types/index.js';

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

    this.collectDeclaredVars(this.ast.body);

    if (this.ast.body.length === 0) {
      const rootReg = this.allocRegister();
      this.emit(Opcode.CREATE_FRAGMENT, rootReg);
      this.emit(Opcode.RETURN, rootReg);
      return {
        bytecode: this.bytecode,
        constants: this.constants,
        reactiveBindings: this.buildReactiveBindings(),
        declaredVars: [...this.declaredVars],
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
      const filtered = content.filter((stmt: any) => stmt && stmt.type !== 'ImportDeclaration');
      return filtered.length === 1 ? filtered[0] : filtered;
    }
    if (content && typeof content === 'object' && content.type === 'ImportDeclaration') {
      return null;
    }
    return content;
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

  private compileElement(node: ElementNode, targetReg: number): void {
    const tagConstIdx = this.addConstant(node.tagName);
    this.emit(Opcode.CREATE_ELEMENT, targetReg, tagConstIdx);

    for (const attr of node.attributes) {
      this.compileAttributeNode(attr, targetReg);
    }

    for (const child of node.children) {
      this.compileNode(child, targetReg);
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

    // Deps = union of both branches' reactive vars + condition identifiers
    const depsSet = new Set<string>(this.collectDepsFromSubModule(consMod, node.test));
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
        if (decl.id?.type === 'Identifier') {
          this.declaredVars.add(decl.id.name);
        }
      }
    } else if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier') {
      this.declaredVars.add(node.id.name);
    } else if (node.type === 'ImportDeclaration' && Array.isArray(node.specifiers)) {
      const source = typeof node.source?.value === 'string' ? node.source.value : '';
      for (const spec of node.specifiers) {
        if (spec.local?.type === 'Identifier') {
          const localName = spec.local.name;
          this.declaredVars.add(localName);
          const isDefault = spec.type === 'ImportDefaultSpecifier';
          const importedName = spec.type === 'ImportSpecifier' && spec.imported?.type === 'Identifier'
            ? spec.imported.name
            : undefined;
          this.imports.push({ localName, source, isDefault, importedName });
        }
      }
    }
  }

  private extractIdentifiers(node: any): Set<string> {
    const ids = new Set<string>();
    if (!node || typeof node !== 'object' || !node.type) return ids;

    switch (node.type) {
      case 'Identifier':
        ids.add(node.name);
        break;
      case 'BinaryExpression':
      case 'LogicalExpression':
        for (const id of this.extractIdentifiers(node.left)) ids.add(id);
        for (const id of this.extractIdentifiers(node.right)) ids.add(id);
        break;
      case 'UnaryExpression':
      case 'UpdateExpression':
        for (const id of this.extractIdentifiers(node.argument)) ids.add(id);
        break;
      case 'MemberExpression':
        for (const id of this.extractIdentifiers(node.object)) ids.add(id);
        break;
      case 'CallExpression':
        for (const id of this.extractIdentifiers(node.callee)) ids.add(id);
        for (const arg of node.arguments) {
          for (const id of this.extractIdentifiers(arg)) ids.add(id);
        }
        break;
      case 'ConditionalExpression':
        for (const id of this.extractIdentifiers(node.test)) ids.add(id);
        for (const id of this.extractIdentifiers(node.consequent)) ids.add(id);
        for (const id of this.extractIdentifiers(node.alternate)) ids.add(id);
        break;
      case 'AssignmentExpression':
        for (const id of this.extractIdentifiers(node.left)) ids.add(id);
        for (const id of this.extractIdentifiers(node.right)) ids.add(id);
        break;
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        for (const id of this.extractIdentifiers(node.body)) ids.add(id);
        break;
      case 'BlockStatement':
        for (const stmt of node.body) {
          for (const id of this.extractIdentifiers(stmt)) ids.add(id);
        }
        break;
      case 'ExpressionStatement':
        for (const id of this.extractIdentifiers(node.expression)) ids.add(id);
        break;
      case 'ReturnStatement':
        if (node.argument) {
          for (const id of this.extractIdentifiers(node.argument)) ids.add(id);
        }
        break;
      case 'NewExpression':
        for (const id of this.extractIdentifiers(node.callee)) ids.add(id);
        if (node.arguments) {
          for (const arg of node.arguments) {
            for (const id of this.extractIdentifiers(arg)) ids.add(id);
          }
        }
        break;
      case 'ForStatement':
        if (node.init) for (const id of this.extractIdentifiers(node.init)) ids.add(id);
        if (node.test) for (const id of this.extractIdentifiers(node.test)) ids.add(id);
        if (node.update) for (const id of this.extractIdentifiers(node.update)) ids.add(id);
        if (node.body) for (const id of this.extractIdentifiers(node.body)) ids.add(id);
        break;
      case 'ForOfStatement':
      case 'ForInStatement':
        if (node.left) for (const id of this.extractIdentifiers(node.left)) ids.add(id);
        if (node.right) for (const id of this.extractIdentifiers(node.right)) ids.add(id);
        if (node.body) for (const id of this.extractIdentifiers(node.body)) ids.add(id);
        break;
      case 'WhileStatement':
      case 'DoWhileStatement':
        if (node.test) for (const id of this.extractIdentifiers(node.test)) ids.add(id);
        if (node.body) for (const id of this.extractIdentifiers(node.body)) ids.add(id);
        break;
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
      value = { __drift_fn__: `(scope, declaredVars, setScopeValue) => (${codeStr})` };
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

  private emitJumpIfFalsePlaceholder(condReg: number): number {
    const pos = this.bytecode.length;
    this.bytecode.push(Opcode.JUMP_IF_FALSE, condReg, 0, 0);
    return pos;
  }

  private emitJumpPlaceholder(): number {
    const pos = this.bytecode.length;
    this.bytecode.push(Opcode.JUMP, 0, 0);
    return pos;
  }

  private emitJump(targetByte: number): void {
    const high = (targetByte >> 8) & 0xff;
    const low = targetByte & 0xff;
    this.bytecode.push(Opcode.JUMP, high, low);
  }

  private emitLoopIterPlaceholder(
    arrayReg: number,
    itemReg: number,
    indexReg: number,
    itemConstIdx: number,
    indexConstIdx: number
  ): number {
    const pos = this.bytecode.length;
    const itemHigh = (itemConstIdx >> 8) & 0xff;
    const itemLow = itemConstIdx & 0xff;
    const idxHigh = (indexConstIdx >> 8) & 0xff;
    const idxLow = indexConstIdx & 0xff;

    this.bytecode.push(
      Opcode.LOOP_ITER,
      arrayReg,
      itemReg,
      indexReg,
      itemHigh,
      itemLow,
      idxHigh,
      idxLow,
      0,
      0
    );
    return pos;
  }

  private patchJump(pos: number, targetByte: number): void {
    const high = (targetByte >> 8) & 0xff;
    const low = targetByte & 0xff;

    const op = this.bytecode[pos];
    if (op === Opcode.JUMP_IF_FALSE) {
      this.bytecode[pos + 2] = high;
      this.bytecode[pos + 3] = low;
    } else if (op === Opcode.JUMP) {
      this.bytecode[pos + 1] = high;
      this.bytecode[pos + 2] = low;
    } else if (op === Opcode.LOOP_ITER) {
      this.bytecode[pos + 8] = high;
      this.bytecode[pos + 9] = low;
    }
  }
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
      return `('${node.name}' in (scope || {}) ? scope[${JSON.stringify(node.name)}] : (typeof globalThis !== 'undefined' && '${node.name}' in globalThis ? globalThis[${JSON.stringify(node.name)}] : undefined))`;

    case 'Literal':
      if (typeof node.raw === 'string') return node.raw;
      return typeof node.value === 'string' ? JSON.stringify(node.value) : String(node.value);

    case 'BinaryExpression':
    case 'LogicalExpression':
      return `(${astToJS(node.left, locals)} ${node.operator} ${astToJS(node.right, locals)})`;

    case 'UnaryExpression':
      return `(${node.operator} ${astToJS(node.argument, locals)})`;

    case 'ConditionalExpression':
      return `(${astToJS(node.test, locals)} ? ${astToJS(node.consequent, locals)} : ${astToJS(node.alternate, locals)})`;

    case 'MemberExpression':
      return node.computed
        ? `(${astToJS(node.object, locals)}[${astToJS(node.property, locals)}])`
        : `(${astToJS(node.object, locals)}.${node.property.name})`;

    case 'CallExpression': {
      const calleeJS = astToJS(node.callee, locals);
      const argsJS = node.arguments ? node.arguments.map((arg: any) => astToJS(arg, locals)).join(', ') : '';
      return `(${calleeJS}(${argsJS}))`;
    }

    case 'AssignmentExpression': {
      if (node.left?.type === 'Identifier') {
        const name = node.left.name;
        const valJS = astToJS(node.right, locals);
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
      return `(${astToJS(node.left, locals)} ${node.operator} ${astToJS(node.right, locals)})`;
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
      return node.prefix
        ? `(${node.operator}${astToJS(node.argument, locals)})`
        : `(${astToJS(node.argument, locals)}${node.operator})`;
    }

    case 'SequenceExpression':
      return `(${node.expressions ? node.expressions.map((e: any) => astToJS(e, locals)).join(', ') : ''})`;

    case 'ArrayExpression':
      return `[${node.elements ? node.elements.map((el: any) => el?.type === 'SpreadElement' ? '...' + astToJS(el.argument, locals) : astToJS(el, locals)).join(', ') : ''}]`;

    case 'ObjectExpression':
      return `{${node.properties ? node.properties.map((prop: any) => prop.type === 'SpreadElement' ? '...' + astToJS(prop.argument, locals) : `${prop.computed ? '[' + astToJS(prop.key, locals) + ']' : prop.key.name}: ${astToJS(prop.value, locals)}`).join(', ') : ''}}`;

    case 'SpreadElement':
      return `...${astToJS(node.argument, locals)}`;

    case 'TemplateLiteral':
      return `\`${node.quasis ? node.quasis.map((q: any, i: number) => (q.value?.raw ?? '') + (node.expressions && node.expressions[i] ? '\${' + astToJS(node.expressions[i], locals) + '}' : '')).join('') : ''}\``;

    case 'TaggedTemplateExpression': {
      const tagJS = astToJS(node.tag, locals);
      const quasiJS = astToJS(node.quasi, locals);
      return `${tagJS}${quasiJS}`;
    }

    case 'ThisExpression':
      return 'scope';

    case 'BlockStatement': {
      const newLocals = new Set(locals);
      return `(${node.body ? node.body.map((stmt: any) => astToJS(stmt, newLocals)).filter(Boolean).join(', ') : 'undefined'})`;
    }

    case 'ExpressionStatement':
      return astToJS(node.expression, locals);

    case 'ReturnStatement':
      return `return ${node.argument ? astToJS(node.argument, locals) : ''}`;

    case 'IfStatement':
      return `(${astToJS(node.test, locals)} ? ${astToJS(node.consequent, locals)} : ${node.alternate ? astToJS(node.alternate, locals) : 'undefined'})`;

    case 'ForStatement': {
      const newLocals = new Set(locals);
      if (node.init?.type === 'VariableDeclaration' && node.init.declarations) {
        for (const d of node.init.declarations) {
          const varName = d.id?.name;
          if (varName) newLocals.add(varName);
        }
      }
      let initJS = '';
      if (node.init?.type === 'VariableDeclaration' && node.init.declarations) {
        initJS = 'let ' + node.init.declarations.map((d: any) => `${d.id.name} = ${d.init ? astToJS(d.init, newLocals) : 'undefined'}`).join(', ');
      } else if (node.init) {
        initJS = astToJS(node.init, newLocals);
      }
      const testJS = node.test ? astToJS(node.test, newLocals) : '';
      const updateJS = node.update ? astToJS(node.update, newLocals) : '';
      const bodyJS = node.body ? astToJS(node.body, newLocals) : '';
      return `(() => { for (${initJS}; ${testJS}; ${updateJS}) ${bodyJS}; })()`;
    }

    case 'ForOfStatement': {
      const newLocals = new Set(locals);
      const varName = node.left?.type === 'VariableDeclaration' ? node.left.declarations[0]?.id?.name : node.left?.name;
      if (varName) newLocals.add(varName);
      return `(() => { const _iter = (typeof resolveIterable === 'function' ? resolveIterable(${astToJS(node.right, locals)}) : (${astToJS(node.right, locals)} || [])); for (let ${varName} of _iter) { if (scope) scope[${JSON.stringify(varName)}] = ${varName}; ${astToJS(node.body, newLocals)}; } })()`;
    }

    case 'ForInStatement': {
      const newLocals = new Set(locals);
      const varName = node.left?.type === 'VariableDeclaration' ? node.left.declarations[0]?.id?.name : node.left?.name;
      if (varName) newLocals.add(varName);
      return `(() => { const _obj = ${astToJS(node.right, locals)}; if (_obj) { for (let ${varName} in _obj) { if (scope) scope[${JSON.stringify(varName)}] = ${varName}; ${astToJS(node.body, newLocals)}; } } })()`;
    }

    case 'WhileStatement':
      return `(() => { while (${astToJS(node.test, locals)}) ${astToJS(node.body, locals)}; })()`;

    case 'DoWhileStatement':
      return `(() => { do ${astToJS(node.body, locals)} while (${astToJS(node.test, locals)}); })()`;

    case 'VariableDeclaration': {
      const newLocals = new Set(locals);
      const decls = node.declarations ? node.declarations.map((d: any) => {
        const name = d.id?.name || astToJS(d.id, locals);
        if (d.id?.name) newLocals.add(d.id.name);
        const valJS = d.init ? astToJS(d.init, locals) : 'undefined';
        if (locals && d.id?.name && locals.has(d.id.name)) {
          return `${d.id.name} = ${valJS}`;
        }
        return `(typeof setScopeValue === 'function' ? setScopeValue(scope, ${JSON.stringify(name)}, ${valJS}) : ((scope || {})[${JSON.stringify(name)}] = ${valJS}))`;
      }).filter(Boolean).join(', ') : 'undefined';
      return `(${decls})`;
    }

    case 'FunctionDeclaration': {
      const name = node.id?.name;
      const newLocals = new Set(locals);
      if (name) newLocals.add(name);
      const paramNames: string[] = [];
      if (node.params) {
        for (const p of node.params) {
          if (p.type === 'AssignmentPattern') {
            const pName = p.left?.name || astToJS(p.left, locals);
            const defaultVal = astToJS(p.right, locals);
            if (p.left?.name) newLocals.add(p.left.name);
            paramNames.push(`${pName} = ${defaultVal}`);
          } else {
            const pName = p.name || p.id?.name || (p.left && p.left.name) || astToJS(p, locals);
            if (pName) {
              paramNames.push(pName);
              newLocals.add(pName);
            }
          }
        }
      }
      if (node.body?.type === 'BlockStatement' && Array.isArray(node.body.body)) {
        for (const stmt of node.body.body) {
          if (stmt.type === 'VariableDeclaration' && stmt.declarations) {
            for (const d of stmt.declarations) {
              if (d.id?.name) newLocals.add(d.id.name);
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
      const fnCode = `function ${name || ''}(${paramsJS}) ${bodyCode}`;
      if (name) {
        return `(typeof setScopeValue === 'function' ? setScopeValue(scope, ${JSON.stringify(name)}, ${fnCode}) : ((scope || {})[${JSON.stringify(name)}] = ${fnCode}))`;
      }
      return fnCode;
    }

    case 'ArrowFunctionExpression':
    case 'FunctionExpression': {
      const newLocals = new Set(locals);
      const paramNames: string[] = [];
      if (node.params) {
        for (const p of node.params) {
          if (p.type === 'AssignmentPattern') {
            const pName = p.left?.name || astToJS(p.left, locals);
            const defaultVal = astToJS(p.right, locals);
            if (p.left?.name) newLocals.add(p.left.name);
            paramNames.push(`${pName} = ${defaultVal}`);
          } else {
            const pName = p.name || p.id?.name || (p.left && p.left.name) || astToJS(p, locals);
            if (pName) {
              paramNames.push(pName);
              newLocals.add(pName);
            }
          }
        }
      }
      if (node.body?.type === 'BlockStatement' && Array.isArray(node.body.body)) {
        for (const stmt of node.body.body) {
          if (stmt.type === 'VariableDeclaration' && stmt.declarations) {
            for (const d of stmt.declarations) {
              if (d.id?.name) newLocals.add(d.id.name);
            }
          } else if (stmt.type === 'FunctionDeclaration' && stmt.id?.name) {
            newLocals.add(stmt.id.name);
          }
        }
      }
      const paramsJS = paramNames.join(', ');
      if (node.body?.type === 'BlockStatement') {
        const bodyCode = `{ ${node.body.body.map((s: any) => astToJS(s, newLocals)).filter(Boolean).join('; ')}; }`;
        return `((${paramsJS}) => ${bodyCode})`;
      }
      const bodyJS = astToJS(node.body, newLocals);
      return `((${paramsJS}) => ${bodyJS})`;
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
