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
      case ASTNodeType.Switch:
        this.compileSwitchNode(node, parentReg);
        break;
    }
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
        const scriptBodyIdx = this.addConstant(child.content);
        this.emit(Opcode.EXEC_SCRIPT, scriptBodyIdx);
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

    // Deps = body's reactive vars + identifiers from iterable expression
    const deps = this.collectDepsFromSubModule(bodyMod, node.iterable);
    const depsIdx = this.addConstant(deps);

    // REACTIVE_FOR parentReg iterIdx itemNameIdx indexNameIdx bodyIdx depsIdx  (6 operand bytes)
    this.emit(Opcode.REACTIVE_FOR, parentReg, iterIdx, itemNameIdx, indexNameIdx, bodyIdx, depsIdx);
  }

  private compileSwitchNode(node: SwitchNode, parentReg: number): void {
    const discReg = this.allocRegister();
    const discIdx = this.addConstant(node.discriminant);
    this.emit(Opcode.EVAL_EXPR, discReg, discIdx);

    const exitJumpPatches: number[] = [];

    for (const c of node.cases) {
      if (c.expression !== null) {
        const valReg = this.allocRegister();
        const valIdx = this.addConstant(c.expression);
        this.emit(Opcode.EVAL_EXPR, valReg, valIdx);

        const matchReg = this.allocRegister();
        const compareExprIdx = this.addConstant({
          type: 'BinaryExpression',
          operator: '===',
          left: node.discriminant,
          right: c.expression,
        });
        this.emit(Opcode.EVAL_EXPR, matchReg, compareExprIdx);

        const skipCasePos = this.emitJumpIfFalsePlaceholder(matchReg);

        for (const child of c.body) {
          this.compileNode(child, parentReg);
        }

        const exitPos = this.emitJumpPlaceholder();
        exitJumpPatches.push(exitPos);

        const nextCaseTarget = this.bytecode.length;
        this.patchJump(skipCasePos, nextCaseTarget);
      } else {
        for (const child of c.body) {
          this.compileNode(child, parentReg);
        }
      }
    }

    const switchEndTarget = this.bytecode.length;
    for (const exitPos of exitJumpPatches) {
      this.patchJump(exitPos, switchEndTarget);
    }
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
    let processedValue = value;

    if (
      (typeof value === 'object' && value !== null && typeof value.type === 'string') ||
      (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null && typeof value[0].type === 'string')
    ) {
      const isStatement = Array.isArray(value) || value.type === 'BlockStatement' || value.type === 'ExpressionStatement' || value.type === 'IfStatement' || value.type === 'VariableDeclaration' || value.type === 'FunctionDeclaration';
      const jsCode = astToJS(value);
      const fnStr = isStatement
        ? `(scope, declaredVars, setScopeValue) => { ${jsCode} }`
        : `(scope, declaredVars, setScopeValue) => { return (${jsCode}); }`;
      
      processedValue = {
        __drift_fn__: fnStr,
        ast: value,
      };
    }

    const existingIndex = this.constants.findIndex((c) => this.isConstantEqual(c, processedValue));
    if (existingIndex !== -1) {
      return existingIndex;
    }

    this.constants.push(processedValue);
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
export function astToJS(node: any): string {
  if (node === null || node === undefined) return 'undefined';
  if (typeof node !== 'object') return typeof node === 'string' ? JSON.stringify(node) : String(node);
  if (Array.isArray(node)) return node.map(astToJS).join('; ');

  switch (node.type) {
    case 'Identifier':
      return `('${node.name}' in (scope || {}) ? scope[${JSON.stringify(node.name)}] : (typeof globalThis !== 'undefined' && '${node.name}' in globalThis ? globalThis[${JSON.stringify(node.name)}] : undefined))`;

    case 'Literal':
      if (typeof node.raw === 'string') return node.raw;
      return typeof node.value === 'string' ? JSON.stringify(node.value) : String(node.value);

    case 'BinaryExpression':
    case 'LogicalExpression':
      return `(${astToJS(node.left)} ${node.operator} ${astToJS(node.right)})`;

    case 'UnaryExpression':
      return `(${node.operator} ${astToJS(node.argument)})`;

    case 'ConditionalExpression':
      return `(${astToJS(node.test)} ? ${astToJS(node.consequent)} : ${astToJS(node.alternate)})`;

    case 'MemberExpression':
      return node.computed
        ? `(${astToJS(node.object)}?.[${astToJS(node.property)}])`
        : `(${astToJS(node.object)}?.${node.property.name})`;

    case 'CallExpression': {
      const calleeJS = astToJS(node.callee);
      const argsJS = node.arguments ? node.arguments.map(astToJS).join(', ') : '';
      if (node.callee?.type === 'MemberExpression') {
        const objJS = astToJS(node.callee.object);
        const propJS = node.callee.computed ? astToJS(node.callee.property) : JSON.stringify(node.callee.property.name);
        return `(${objJS}?.[${propJS}]?.(${argsJS}))`;
      }
      return `(${calleeJS}?.(${argsJS}))`;
    }

    case 'AssignmentExpression': {
      if (node.left?.type === 'Identifier') {
        const name = node.left.name;
        const valJS = astToJS(node.right);
        if (node.operator === '=') {
          return `(typeof setScopeValue === 'function' ? setScopeValue(scope, ${JSON.stringify(name)}, ${valJS}) : ((scope || {})[${JSON.stringify(name)}] = ${valJS}))`;
        } else {
          const op = node.operator.slice(0, -1);
          return `(typeof setScopeValue === 'function' ? setScopeValue(scope, ${JSON.stringify(name)}, (scope[${JSON.stringify(name)}] ${op} ${valJS})) : ((scope || {})[${JSON.stringify(name)}] ${node.operator} ${valJS}))`;
        }
      }
      return `(${astToJS(node.left)} ${node.operator} ${astToJS(node.right)})`;
    }

    case 'UpdateExpression': {
      if (node.argument?.type === 'Identifier') {
        const name = node.argument.name;
        const op = node.operator === '++' ? '+' : '-';
        if (node.prefix) {
          return `(typeof setScopeValue === 'function' ? (setScopeValue(scope, ${JSON.stringify(name)}, (Number(scope[${JSON.stringify(name)}]) || 0) ${op} 1), scope[${JSON.stringify(name)}]) : ((scope || {})[${JSON.stringify(name)}] = (Number((scope || {})[${JSON.stringify(name)}]) || 0) ${op} 1))`;
        } else {
          return `(() => { const _v = Number(scope[${JSON.stringify(name)}]) || 0; if (typeof setScopeValue === 'function') setScopeValue(scope, ${JSON.stringify(name)}, _v ${op} 1); else (scope || {})[${JSON.stringify(name)}] = _v ${op} 1; return _v; })()`;
        }
      }
      return node.prefix
        ? `(${node.operator}${astToJS(node.argument)})`
        : `(${astToJS(node.argument)}${node.operator})`;
    }

    case 'SequenceExpression':
      return `(${node.expressions ? node.expressions.map(astToJS).join(', ') : ''})`;

    case 'ArrayExpression':
      return `[${node.elements ? node.elements.map((el: any) => el?.type === 'SpreadElement' ? '...' + astToJS(el.argument) : astToJS(el)).join(', ') : ''}]`;

    case 'ObjectExpression':
      return `{${node.properties ? node.properties.map((prop: any) => prop.type === 'SpreadElement' ? '...' + astToJS(prop.argument) : `${prop.computed ? '[' + astToJS(prop.key) + ']' : prop.key.name}: ${astToJS(prop.value)}`).join(', ') : ''}}`;

    case 'TemplateLiteral':
      return `\`${node.quasis ? node.quasis.map((q: any, i: number) => (q.value?.raw ?? '') + (node.expressions && node.expressions[i] ? '\${' + astToJS(node.expressions[i]) + '}' : '')).join('') : ''}\``;

    case 'ThisExpression':
      return 'scope';

    case 'BlockStatement':
      return `{ ${node.body ? node.body.map(astToJS).join('; ') : ''} }`;

    case 'ExpressionStatement':
      return `${astToJS(node.expression)};`;

    case 'ReturnStatement':
      return `return ${node.argument ? astToJS(node.argument) : ''};`;

    case 'IfStatement':
      return `if (${astToJS(node.test)}) ${astToJS(node.consequent)} ${node.alternate ? 'else ' + astToJS(node.alternate) : ''}`;

    case 'ForStatement':
      return `for (${node.init ? astToJS(node.init) : ''}; ${node.test ? astToJS(node.test) : ''}; ${node.update ? astToJS(node.update) : ''}) ${astToJS(node.body)}`;

    case 'ForOfStatement': {
      const varName = node.left?.type === 'VariableDeclaration' ? node.left.declarations[0]?.id?.name : node.left?.name;
      return `for (let ${varName} of ${astToJS(node.right)}) ${astToJS(node.body)}`;
    }

    case 'ForInStatement': {
      const varName = node.left?.type === 'VariableDeclaration' ? node.left.declarations[0]?.id?.name : node.left?.name;
      return `for (let ${varName} in ${astToJS(node.right)}) ${astToJS(node.body)}`;
    }

    case 'WhileStatement':
      return `while (${astToJS(node.test)}) ${astToJS(node.body)}`;

    case 'DoWhileStatement':
      return `do ${astToJS(node.body)} while (${astToJS(node.test)})`;

    case 'VariableDeclaration':
      return `var ${node.declarations ? node.declarations.map((d: any) => {
        const name = d.id?.name || astToJS(d.id);
        const valJS = d.init ? astToJS(d.init) : 'undefined';
        return `_res_${name} = (typeof setScopeValue === 'function' ? setScopeValue(scope, ${JSON.stringify(name)}, ${valJS}) : ((scope || {})[${JSON.stringify(name)}] = ${valJS}))`;
      }).join(', ') : ''};`;

    case 'FunctionDeclaration': {
      const name = node.id?.name;
      const paramsJS = node.params ? node.params.map((p: any) => p.name || astToJS(p)).join(', ') : '';
      const bodyJS = astToJS(node.body);
      const fnCode = `function ${name || ''}(${paramsJS}) ${bodyJS}`;
      if (name) {
        return `(typeof setScopeValue === 'function' ? setScopeValue(scope, ${JSON.stringify(name)}, ${fnCode}) : ((scope || {})[${JSON.stringify(name)}] = ${fnCode}))`;
      }
      return fnCode;
    }

    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return `((${node.params ? node.params.map((p: any) => p.name || astToJS(p)).join(', ') : ''}) => ${astToJS(node.body)})`;

    case 'NewExpression':
      return `new (${astToJS(node.callee)})(${node.arguments ? node.arguments.map(astToJS).join(', ') : ''})`;

    default:
      return '';
  }
}
