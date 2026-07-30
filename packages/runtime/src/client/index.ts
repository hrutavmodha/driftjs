import { CompiledModule, Opcode, ReactiveBinding, ItemRecord } from '../../types/index.js';
import { reconcileKeyedList } from './reconciler.js';

export interface VMExecutionOptions {
  readonly scope?: Record<string, any>;
  readonly document?: Document;
}

interface LoopFrame {
  readonly pc: number;
  index: number;
  readonly items: any[];
}

/** A self-contained reactive region that re-renders its DOM subtree when deps change. */
interface ReactiveRegion {
  readonly deps: ReadonlySet<string>;
  readonly reRender: () => void;
}

/**
 * Sets a variable in scope, updating the parent scope where the variable was defined
 * if it exists higher up the prototype chain.
 */
function setScopeValue(targetScope: Record<string, any>, name: string, val: any): void {
  let curr = targetScope;
  while (curr && curr !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(curr, name)) {
      curr[name] = val;
      return;
    }
    curr = Object.getPrototypeOf(curr);
  }
  targetScope[name] = val;
}

/**
 * Evaluates an Acorn AST node against the given scope without eval/new Function (100% CSP compliant).
 */
function evaluateExpression(node: any, scope: Record<string, any>, declaredVars?: Set<string>): any {
  if (node === null || node === undefined) return node;

  if (typeof node !== 'object' || !node.type) {
    return node;
  }

  switch (node.type) {
    case 'Identifier':
      if (node.name in scope) return scope[node.name];
      if (typeof globalThis !== 'undefined' && node.name in globalThis) return (globalThis as any)[node.name];
      return undefined;

    case 'Literal':
      return node.value;

    case 'BinaryExpression': {
      const left = evaluateExpression(node.left, scope, declaredVars);
      const right = evaluateExpression(node.right, scope, declaredVars);
      switch (node.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '%': return left % right;
        case '**': return left ** right;
        case '<': return left < right;
        case '>': return left > right;
        case '<=': return left <= right;
        case '>=': return left >= right;
        case '==': return left == right;
        case '!=': return left != right;
        case '===': return left === right;
        case '!==': return left !== right;
        case '|': return left | right;
        case '^': return left ^ right;
        case '&': return left & right;
        case '<<': return left << right;
        case '>>': return left >> right;
        case '>>>': return left >>> right;
        case 'in': return left in right;
        case 'instanceof': return left instanceof right;
        default: return undefined;
      }
    }

    case 'LogicalExpression': {
      const left = evaluateExpression(node.left, scope, declaredVars);
      if (node.operator === '||') {
        if (left) return left;
        return evaluateExpression(node.right, scope, declaredVars);
      }
      if (node.operator === '&&') {
        if (!left) return left;
        return evaluateExpression(node.right, scope, declaredVars);
      }
      if (node.operator === '??') {
        return left ?? evaluateExpression(node.right, scope, declaredVars);
      }
      return undefined;
    }

    case 'UnaryExpression': {
      const arg = evaluateExpression(node.argument, scope, declaredVars);
      switch (node.operator) {
        case '-': return -arg;
        case '+': return +arg;
        case '!': return !arg;
        case '~': return ~arg;
        case 'typeof': return typeof arg;
        case 'void': return void arg;
        case 'delete': return true;
        default: return undefined;
      }
    }

    case 'UpdateExpression': {
      const arg = evaluateExpression(node.argument, scope, declaredVars);
      const name = node.argument.name;
      const newVal = node.operator === '++' ? arg + 1 : arg - 1;
      setScopeValue(scope, name, newVal);
      return node.prefix ? newVal : arg;
    }

    case 'MemberExpression': {
      const obj = evaluateExpression(node.object, scope, declaredVars);
      if (!obj) return undefined;
      if (node.computed) {
        const prop = evaluateExpression(node.property, scope, declaredVars);
        return obj[prop];
      }
      return obj[node.property.name];
    }

    case 'CallExpression': {
      const callee = evaluateExpression(node.callee, scope, declaredVars);
      const args = node.arguments.map((arg: any) => evaluateExpression(arg, scope, declaredVars));
      if (typeof callee === 'function') {
        if (node.callee.type === 'MemberExpression') {
          const thisObj = evaluateExpression(node.callee.object, scope, declaredVars);
          return callee.apply(thisObj, args);
        }
        return callee(...args);
      }
      return undefined;
    }

    case 'ConditionalExpression': {
      const test = evaluateExpression(node.test, scope, declaredVars);
      return test
        ? evaluateExpression(node.consequent, scope, declaredVars)
        : evaluateExpression(node.alternate, scope, declaredVars);
    }

    case 'AssignmentExpression': {
      const right = evaluateExpression(node.right, scope, declaredVars);
      const getNewVal = (oldVal: any) => {
        switch (node.operator) {
          case '=': return right;
          case '+=': return oldVal + right;
          case '-=': return oldVal - right;
          case '*=': return oldVal * right;
          case '/=': return oldVal / right;
          case '%=': return oldVal % right;
          default: return right;
        }
      };

      if (node.left.type === 'Identifier') {
        const name = node.left.name;
        const oldVal = scope[name];
        const val = getNewVal(oldVal);
        setScopeValue(scope, name, val);
        return val;
      }
      if (node.left.type === 'MemberExpression') {
        const obj = evaluateExpression(node.left.object, scope, declaredVars);
        if (obj) {
          const prop = node.left.computed
            ? evaluateExpression(node.left.property, scope, declaredVars)
            : node.left.property.name;
          const oldVal = obj[prop];
          const val = getNewVal(oldVal);
          obj[prop] = val;
          return val;
        }
      }
      return undefined;
    }

    case 'SequenceExpression': {
      let result: any;
      for (const expr of node.expressions) {
        result = evaluateExpression(expr, scope, declaredVars);
      }
      return result;
    }

    case 'ArrayExpression': {
      const result: any[] = [];
      for (const el of node.elements) {
        if (el && el.type === 'SpreadElement') {
          const spread = evaluateExpression(el.argument, scope, declaredVars);
          if (Array.isArray(spread)) result.push(...spread);
        } else {
          result.push(evaluateExpression(el, scope, declaredVars));
        }
      }
      return result;
    }

    case 'ObjectExpression': {
      const obj: Record<string, any> = {};
      for (const prop of node.properties) {
        if (prop.type === 'SpreadElement') {
          const spread = evaluateExpression(prop.argument, scope, declaredVars);
          Object.assign(obj, spread);
        } else {
          const key = prop.computed
            ? evaluateExpression(prop.key, scope, declaredVars)
            : prop.key.name;
          obj[key] = evaluateExpression(prop.value, scope, declaredVars);
        }
      }
      return obj;
    }

    case 'SpreadElement': {
      return evaluateExpression(node.argument, scope, declaredVars);
    }

    case 'TemplateLiteral': {
      let result = '';
      for (let i = 0; i < node.quasis.length; i++) {
        result += node.quasis[i].value.raw;
        if (i < node.expressions.length) {
          result += String(evaluateExpression(node.expressions[i], scope, declaredVars));
        }
      }
      return result;
    }

    case 'TaggedTemplateExpression': {
      const tagFn = evaluateExpression(node.tag, scope, declaredVars);
      const quasis = node.quasi.quasis.map((q: any) => q.value.raw);
      quasis.raw = quasis;
      const expressions = node.quasi.expressions.map((e: any) => evaluateExpression(e, scope, declaredVars));
      return tagFn(quasis, ...expressions);
    }

    case 'ThisExpression':
      return scope;

    case 'BlockStatement': {
      let result: any;
      for (const stmt of node.body) {
        result = evaluateExpression(stmt, scope, declaredVars);
      }
      return result;
    }

    case 'ExpressionStatement':
      return evaluateExpression(node.expression, scope, declaredVars);

    case 'ReturnStatement':
      return node.argument ? evaluateExpression(node.argument, scope, declaredVars) : undefined;

    case 'IfStatement': {
      const test = evaluateExpression(node.test, scope, declaredVars);
      if (test) {
        return evaluateExpression(node.consequent, scope, declaredVars);
      }
      return node.alternate ? evaluateExpression(node.alternate, scope, declaredVars) : undefined;
    }

    case 'NewExpression': {
      const callee = evaluateExpression(node.callee, scope, declaredVars);
      const args = node.arguments ? node.arguments.map((arg: any) => evaluateExpression(arg, scope, declaredVars)) : [];
      if (typeof callee === 'function') {
        return new (callee as any)(...args);
      }
      return undefined;
    }

    case 'ForStatement': {
      if (node.init) evaluateExpression(node.init, scope, declaredVars);
      while (node.test ? evaluateExpression(node.test, scope, declaredVars) : true) {
        evaluateExpression(node.body, scope, declaredVars);
        if (node.update) evaluateExpression(node.update, scope, declaredVars);
      }
      return undefined;
    }

    case 'ForOfStatement': {
      const right = evaluateExpression(node.right, scope, declaredVars);
      if (right && typeof right[Symbol.iterator] === 'function') {
        const varName = node.left.type === 'VariableDeclaration' ? node.left.declarations[0].id.name : node.left.name;
        for (const item of right) {
          scope[varName] = item;
          evaluateExpression(node.body, scope, declaredVars);
        }
      }
      return undefined;
    }

    case 'ForInStatement': {
      const right = evaluateExpression(node.right, scope, declaredVars);
      if (right && typeof right === 'object') {
        const varName = node.left.type === 'VariableDeclaration' ? node.left.declarations[0].id.name : node.left.name;
        for (const key in right) {
          scope[varName] = key;
          evaluateExpression(node.body, scope, declaredVars);
        }
      }
      return undefined;
    }

    case 'WhileStatement': {
      while (evaluateExpression(node.test, scope, declaredVars)) {
        evaluateExpression(node.body, scope, declaredVars);
      }
      return undefined;
    }

    case 'DoWhileStatement': {
      do {
        evaluateExpression(node.body, scope, declaredVars);
      } while (evaluateExpression(node.test, scope, declaredVars));
      return undefined;
    }

    case 'VariableDeclaration': {
      for (const decl of node.declarations) {
        if (decl.id.type === 'Identifier') {
          scope[decl.id.name] = decl.init ? evaluateExpression(decl.init, scope, declaredVars) : undefined;
        }
      }
      return undefined;
    }

    case 'FunctionDeclaration': {
      // Register the function in scope so it can be referenced by name (e.g. onclick={increment}).
      if (node.id?.type === 'Identifier') {
        const capturedScope = scope;
        const capturedDeclaredVars = declaredVars;
        const fn = (...args: any[]) => {
          const childScope = Object.create(capturedScope);
          node.params.forEach((param: any, i: number) => {
            if (param.type === 'Identifier') {
              childScope[param.name] = args[i];
            } else if (param.type === 'AssignmentPattern') {
              const name = param.left.type === 'Identifier' ? param.left.name : null;
              if (name) {
                const defaultVal = evaluateExpression(param.right, childScope, capturedDeclaredVars);
                childScope[name] = args[i] !== undefined ? args[i] : defaultVal;
              }
            }
          });
          return evaluateExpression(node.body, childScope, capturedDeclaredVars);
        };
        scope[node.id.name] = fn;
      }
      return undefined;
    }

    case 'ArrowFunctionExpression':
    case 'FunctionExpression': {
      const capturedScope = scope;
      const capturedDeclaredVars = declaredVars;
      return (...args: any[]) => {
        const childScope = Object.create(capturedScope);
        node.params.forEach((param: any, i: number) => {
          if (param.type === 'Identifier') {
            childScope[param.name] = args[i];
          } else if (param.type === 'AssignmentPattern') {
            const name = param.left.type === 'Identifier' ? param.left.name : null;
            if (name) {
              const defaultVal = evaluateExpression(param.right, childScope, capturedDeclaredVars);
              childScope[name] = args[i] !== undefined ? args[i] : defaultVal;
            }
          }
        });
        return evaluateExpression(node.body, childScope, capturedDeclaredVars);
      };
    }

    default:
      return undefined;
  }
}

/**
 * Resolves constant or variable values against scope without eval/new Function (100% CSP compliant).
 */
function resolveValue(val: any, scope: Record<string, any>, declaredVars?: Set<string>): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') return val in scope ? scope[val] : val;
  if (typeof val === 'object' && val.type) return evaluateExpression(val, scope, declaredVars);
  return val;
}

/**
 * Removes all DOM nodes between two comment anchor nodes (exclusive of the anchors themselves).
 */
function clearBetweenAnchors(start: Comment, end: Comment): void {
  let node = start.nextSibling;
  while (node && node !== end) {
    const next = node.nextSibling;
    node.parentNode!.removeChild(node);
    node = next;
  }
}

/**
 * Register-based Virtual Machine for executing compiled DriftJS templates.
 * Clean, lightweight, and 100% CSP compliant.
 */
export class DriftClientVirtualMachine {
  private static readonly MAX_REGISTERS = 256;
  private readonly registers: (Node | any)[] = new Array(DriftClientVirtualMachine.MAX_REGISTERS);
  private scope: Record<string, any> = {};
  private module: CompiledModule | null = null;
  private declaredVars: Set<string> = new Set();
  private doc: Document | null = null;
  private reactiveRegions: ReactiveRegion[] = [];
  private delegatedEvents = new Set<string>();
  private eventHandlersMap = new WeakMap<Node, Record<string, (e: Event) => void>>();

  private ensureEventDelegated(eventName: string): void {
    if (this.delegatedEvents.has(eventName)) return;
    this.delegatedEvents.add(eventName);

    const root = this.doc || (typeof document !== 'undefined' ? document : null);
    if (!root) return;

    root.addEventListener(eventName, (e: Event) => {
      let curr = e.target as Node | null;
      while (curr && curr !== root) {
        if (curr.nodeType === 1) {
          const handlers = this.eventHandlersMap.get(curr);
          if (handlers && handlers[eventName]) {
            handlers[eventName](e);
            break;
          }
        }
        curr = curr.parentNode;
      }
    });
  }

  private checkRegister(index: number): void {
    if (index < 0 || index >= DriftClientVirtualMachine.MAX_REGISTERS) {
      throw new Error(`Register index ${index} out of bounds (0-${DriftClientVirtualMachine.MAX_REGISTERS - 1})`);
    }
  }

  private setRegister(index: number, value: any): void {
    this.checkRegister(index);
    this.registers[index] = value;
  }

  private getRegister(index: number): any {
    this.checkRegister(index);
    return this.registers[index];
  }

  /**
   * Runs the bytecode of a sub-module using fresh registers but the VM's shared scope,
   * declaredVars, doc, and reactiveRegions. Used by REACTIVE_IF / REACTIVE_FOR handlers.
   */
  private runSubModule(
    subMod: { bytecode: readonly number[]; constants: readonly any[] },
    scope: Record<string, any>
  ): Node | null {
    const savedRegisters = [...this.registers];
    const savedModule = this.module;
    this.registers.fill(undefined);
    this.module = subMod as CompiledModule;

    const result = this.executeLoop(subMod.bytecode, subMod.constants, scope);

    this.registers.fill(undefined);
    for (let i = 0; i < savedRegisters.length; i++) this.registers[i] = savedRegisters[i];
    this.module = savedModule;
    return result;
  }

  /**
   * Core execution loop — shared between the top-level execute() and runSubModule().
   */
  private executeLoop(
    bytecode: readonly number[],
    constants: readonly any[],
    scope: Record<string, any>
  ): Node | null {
    const doc = this.doc!;
    let pc = 0;
    const loopStack: LoopFrame[] = [];

    while (pc < bytecode.length) {
      const opcode = bytecode[pc];

      switch (opcode) {
        case Opcode.RETURN: {
          return this.getRegister(bytecode[pc + 1]!) as Node | null;
        }

        case Opcode.CREATE_ELEMENT: {
          const dstReg = bytecode[pc + 1]!;
          const tag = constants[bytecode[pc + 2]!];
          this.setRegister(dstReg, doc.createElement(String(tag)));
          pc += 3;
          break;
        }

        case Opcode.CREATE_TEXT: {
          const dstReg = bytecode[pc + 1]!;
          const text = constants[bytecode[pc + 2]!];
          const val = resolveValue(text, scope, this.declaredVars);
          this.setRegister(dstReg, doc.createTextNode(val != null ? String(val) : ''));
          pc += 3;
          break;
        }

        case Opcode.CREATE_COMMENT: {
          const dstReg = bytecode[pc + 1]!;
          const comment = constants[bytecode[pc + 2]!];
          this.setRegister(dstReg, doc.createComment(String(comment ?? '')));
          pc += 3;
          break;
        }

        case Opcode.CREATE_FRAGMENT: {
          const dstReg = bytecode[pc + 1]!;
          this.setRegister(dstReg, doc.createDocumentFragment());
          pc += 2;
          break;
        }

        case Opcode.APPEND_CHILD: {
          const parent = this.getRegister(bytecode[pc + 1]!);
          const child = this.getRegister(bytecode[pc + 2]!);
          if (parent && child && typeof parent.appendChild === 'function') {
            parent.appendChild(child);
          }
          pc += 3;
          break;
        }

        case Opcode.SET_ATTR: {
          const elem = this.getRegister(bytecode[pc + 1]!);
          const attrName = String(constants[bytecode[pc + 2]!]);
          const rawVal = constants[bytecode[pc + 3]!];
          const isDynamic = bytecode[pc + 4]!;
          const val = isDynamic === 1 ? resolveValue(rawVal, scope, this.declaredVars) : rawVal;

          if (elem) {
            if (attrName.startsWith('on') && typeof val === 'function') {
              const eventName = attrName.slice(2).toLowerCase();

              const vm = this;
              const wrappedHandler = function (this: any, ...args: any[]) {
                const scopeSnapshot: Record<string, any> = { ...vm.scope };
                const result = val.apply(this, args);
                const changedVars = new Set<string>();
                for (const key of vm.declaredVars) {
                  if (vm.scope[key] !== scopeSnapshot[key]) changedVars.add(key);
                }
                console.log('[DRIFT RUNTIME] Handled event:', eventName, 'changedVars:', Array.from(changedVars), 'data length:', vm.scope.data?.length);
                if (changedVars.size > 0) vm.triggerUpdates(changedVars);
                return result;
              };

              let handlers = this.eventHandlersMap.get(elem);
              if (!handlers) {
                handlers = {};
                this.eventHandlersMap.set(elem, handlers);
              }
              handlers[eventName] = wrappedHandler;
              this.ensureEventDelegated(eventName);
            } else if (typeof elem.setAttribute === 'function') {
              if (val === true) {
                elem.setAttribute(attrName, '');
              } else if (val === false || val == null) {
                if (typeof elem.removeAttribute === 'function') elem.removeAttribute(attrName);
              } else {
                elem.setAttribute(attrName, String(val));
              }
            }
          }
          pc += 5;
          break;
        }

        case Opcode.INTERPOLATE_TEXT: {
          const dstReg = bytecode[pc + 1]!;
          const expr = constants[bytecode[pc + 2]!];
          const val = resolveValue(expr, scope, this.declaredVars);
          this.setRegister(dstReg, doc.createTextNode(val != null ? String(val) : ''));
          pc += 3;
          break;
        }

        case Opcode.EVAL_EXPR: {
          const dstReg = bytecode[pc + 1]!;
          const expr = constants[bytecode[pc + 2]!];
          this.setRegister(dstReg, resolveValue(expr, scope, this.declaredVars));
          pc += 3;
          break;
        }

        case Opcode.JUMP: {
          pc = (bytecode[pc + 1]! << 8) | bytecode[pc + 2]!;
          break;
        }

        case Opcode.JUMP_IF_FALSE: {
          const cond = this.getRegister(bytecode[pc + 1]!);
          if (!cond) {
            pc = (bytecode[pc + 2]! << 8) | bytecode[pc + 3]!;
          } else {
            pc += 4;
          }
          break;
        }

        case Opcode.LOOP_ITER: {
          const arrayReg = bytecode[pc + 1]!;
          const itemReg = bytecode[pc + 2]!;
          const indexReg = bytecode[pc + 3]!;
          const itemVar = constants[(bytecode[pc + 4]! << 8) | bytecode[pc + 5]!];
          const indexVarIdx = (bytecode[pc + 6]! << 8) | bytecode[pc + 7]!;
          const indexVar = indexVarIdx !== 0xffff ? constants[indexVarIdx] : null;
          const jumpTarget = (bytecode[pc + 8]! << 8) | bytecode[pc + 9]!;

          let frame = loopStack[loopStack.length - 1];
          if (!frame || frame.pc !== pc) {
            const rawIterable = this.getRegister(arrayReg);
            const items = Array.isArray(rawIterable)
              ? rawIterable
              : rawIterable && typeof rawIterable[Symbol.iterator] === 'function'
              ? Array.from(rawIterable)
              : [];
            frame = { pc, index: 0, items };
            loopStack.push(frame);
          }

          if (frame.index < frame.items.length) {
            const itemVal = frame.items[frame.index];
            this.setRegister(itemReg, itemVal);
            if (typeof itemVar === 'string') scope[itemVar] = itemVal;

            if (indexReg !== 0xff) this.setRegister(indexReg, frame.index);
            if (typeof indexVar === 'string') scope[indexVar] = frame.index;

            frame.index++;
            pc += 10;
          } else {
            loopStack.pop();
            pc = jumpTarget;
          }
          break;
        }

        case Opcode.EXEC_SCRIPT: {
          const scriptBody = constants[bytecode[pc + 1]!];
          // scriptBody is either a single AST statement or an array of statements.
          if (Array.isArray(scriptBody)) {
            for (const stmt of scriptBody) {
              evaluateExpression(stmt, scope, this.declaredVars);
            }
          } else if (scriptBody) {
            evaluateExpression(scriptBody, scope, this.declaredVars);
          }
          pc += 2;
          break;
        }

        case Opcode.REACTIVE_IF: {
          const parentReg  = bytecode[pc + 1]!;
          const condIdx    = bytecode[pc + 2]!;
          const consIdx    = bytecode[pc + 3]!;
          const altIdx     = bytecode[pc + 4]!;
          const depsIdx    = bytecode[pc + 5]!;

          const parentElem = this.getRegister(parentReg);
          const condExpr   = constants[condIdx];
          const consMod    = constants[consIdx];
          const altMod     = altIdx !== 0xFF ? constants[altIdx] : null;
          const deps       = new Set<string>(constants[depsIdx] ?? []);

          // Create comment anchor nodes and append to parent
          const startAnchor = doc.createComment('if');
          const endAnchor   = doc.createComment('/if');
          parentElem.appendChild(startAnchor);
          parentElem.appendChild(endAnchor);

          const vm = this;
          // Track child regions registered by sub-module renders so we can remove
          // stale ones before each re-render (prevents parentNode-null crashes).
          let childRegions: ReactiveRegion[] = [];

          const renderIf = () => {
            // Remove previously registered child regions
            for (const r of childRegions) {
              const idx = vm.reactiveRegions.indexOf(r);
              if (idx !== -1) vm.reactiveRegions.splice(idx, 1);
            }
            const before = vm.reactiveRegions.length;
            const cond = evaluateExpression(condExpr, scope, vm.declaredVars);
            const subMod = cond ? consMod : altMod;
            if (subMod) {
              const frag = vm.runSubModule(subMod, scope);
              if (frag && endAnchor.parentNode) endAnchor.parentNode.insertBefore(frag, endAnchor);
            }
            childRegions = vm.reactiveRegions.slice(before);
          };
          renderIf();

          this.reactiveRegions.push({
            deps,
            reRender: () => {
              clearBetweenAnchors(startAnchor, endAnchor);
              renderIf();
            },
          });

          pc += 6;
          break;
        }

        case Opcode.REACTIVE_FOR: {
          const parentReg   = bytecode[pc + 1]!;
          const iterIdx     = bytecode[pc + 2]!;
          const itemNameIdx = bytecode[pc + 3]!;
          const idxNameIdx  = bytecode[pc + 4]!;
          const bodyIdx     = bytecode[pc + 5]!;
          const depsIdx     = bytecode[pc + 6]!;

          const parentElem  = this.getRegister(parentReg);
          const iterExpr    = constants[iterIdx];
          const itemName    = constants[itemNameIdx] as string;
          const indexName   = idxNameIdx !== 0xFF ? constants[idxNameIdx] as string : null;
          const bodyMod     = constants[bodyIdx];
          const deps        = new Set<string>(constants[depsIdx] ?? []);
          const forCacheRef: { cache: ItemRecord[] } = { cache: [] };

          const startAnchor = doc.createComment('for');
          const endAnchor   = doc.createComment('/for');
          parentElem.appendChild(startAnchor);
          parentElem.appendChild(endAnchor);

          const vm = this;
          const renderFor = () => {
            const rawIter = evaluateExpression(iterExpr, scope, vm.declaredVars);
            const items = Array.isArray(rawIter)
              ? rawIter
              : rawIter && typeof rawIter[Symbol.iterator] === 'function'
              ? Array.from(rawIter)
              : [];

            reconcileKeyedList(
              endAnchor.parentNode || parentElem,
              endAnchor,
              forCacheRef,
              items,
              (itemVal, indexVal) => {
                if (itemVal && typeof itemVal === 'object') {
                  if ('key' in itemVal) return (itemVal as any).key;
                  if ('id' in itemVal) return (itemVal as any).id;
                }
                return indexVal;
              },
              (itemVal, indexVal, refNode) => {
                const childScope = { ...scope, [itemName]: itemVal };
                if (indexName) childScope[indexName] = indexVal;

                const before = vm.reactiveRegions.length;
                const frag = vm.runSubModule(bodyMod, childScope);
                const nodes: Node[] = frag
                  ? frag.nodeType === 11
                    ? Array.from(frag.childNodes)
                    : [frag]
                  : [];
                const childRegions = vm.reactiveRegions.slice(before);

                if (frag && refNode.parentNode) {
                  refNode.parentNode.insertBefore(frag, refNode);
                }

                const itemKey =
                  itemVal && typeof itemVal === 'object'
                    ? 'key' in itemVal
                      ? (itemVal as any).key
                      : 'id' in itemVal
                      ? (itemVal as any).id
                      : indexVal
                    : indexVal;

                return {
                  key: itemKey,
                  nodes,
                  childRegions,
                  itemVal,
                  indexVal,
                };
              },
              (record, itemVal, indexVal) => {
                const isObject = (val: any) => val && typeof val === 'object' && val !== null;
                const itemsEqual = (a: any, b: any) => {
                  if (a === b) return true;
                  if (!isObject(a) || !isObject(b)) return false;
                  const keysA = Object.keys(a);
                  const keysB = Object.keys(b);
                  if (keysA.length !== keysB.length) return false;
                  for (const k of keysA) {
                    if (a[k] !== b[k]) return false;
                  }
                  return true;
                };

                const childScope = Object.create(scope);
                childScope[itemName] = itemVal;
                if (indexName) childScope[indexName] = indexVal;

                if (itemsEqual(record.itemVal, itemVal)) {
                  record.indexVal = indexVal;
                  if (record.nodes.length > 0) {
                    vm.patchItemAttributes(bodyMod, childScope, record.nodes[0]);
                  }
                  return;
                }

                record.itemVal = itemVal;
                record.indexVal = indexVal;

                if (record.childRegions) {
                  for (const r of record.childRegions) {
                    const idx = vm.reactiveRegions.indexOf(r);
                    if (idx !== -1) vm.reactiveRegions.splice(idx, 1);
                  }
                }

                const before = vm.reactiveRegions.length;
                const frag = vm.runSubModule(bodyMod, childScope);
                record.childRegions = vm.reactiveRegions.slice(before);

                if (frag && record.nodes.length > 0) {
                  const rootNode = record.nodes[0];
                  if (
                    frag.childNodes.length === 1 &&
                    frag.childNodes[0]?.nodeName === rootNode?.nodeName &&
                    rootNode &&
                    typeof (rootNode as any).setAttribute === 'function'
                  ) {
                    const newElem = frag.childNodes[0] as Element;
                    const elem = rootNode as Element;
                    while (elem.attributes.length > 0) {
                      elem.removeAttribute(elem.attributes[0].name);
                    }
                    for (const attr of Array.from(newElem.attributes)) {
                      elem.setAttribute(attr.name, attr.value);
                    }
                    while (elem.firstChild) {
                      elem.removeChild(elem.firstChild);
                    }
                    while (newElem.firstChild) {
                      elem.appendChild(newElem.firstChild);
                    }
                  } else if (rootNode?.parentNode) {
                    const parent = rootNode.parentNode;
                    const newNodes = frag.nodeType === 11 ? Array.from(frag.childNodes) : [frag];
                    parent.insertBefore(frag, rootNode);
                    for (const oldNode of record.nodes) {
                      if (oldNode.parentNode === parent) {
                        parent.removeChild(oldNode);
                      }
                    }
                    record.nodes = newNodes;
                  }
                }
              }
            );
          };
          renderFor();

          this.reactiveRegions.push({
            deps,
            reRender: () => {
              renderFor();
            },
          });

          pc += 7;
          break;
        }

        default:
          throw new Error(`Unknown Opcode ${opcode} at PC ${pc}`);
      }
    }

    return null;
  }

  /**
   * Fast-path attribute patcher for reactive list items whose item data object hasn't changed.
   * Evaluates dynamic SET_ATTR opcodes in bodyMod against childScope and updates the root DOM element
   * only if an attribute value actually changed.
   */
  public patchItemAttributes(bodyMod: CompiledModule, childScope: Record<string, any>, rootNode: Node): void {
    if (!rootNode || rootNode.nodeType !== 1) return;
    const elem = rootNode as Element;
    const bytecode = bodyMod.bytecode;
    const constants = bodyMod.constants;

    for (let pc = 0; pc < bytecode.length; ) {
      const opcode = bytecode[pc]!;
      switch (opcode) {
        case Opcode.RETURN:
          return;
        case Opcode.CREATE_ELEMENT:
        case Opcode.CREATE_TEXT:
        case Opcode.CREATE_COMMENT:
        case Opcode.APPEND_CHILD:
        case Opcode.JUMP_IF_FALSE:
        case Opcode.EVAL_EXPR:
          pc += 3;
          break;
        case Opcode.SET_ATTR: {
          const attrName = String(constants[bytecode[pc + 2]!]);
          const rawVal = constants[bytecode[pc + 3]!];
          const isDynamic = bytecode[pc + 4]!;
          if (isDynamic === 1) {
            const val = resolveValue(rawVal, childScope, this.declaredVars);
            const targetVal = val === true ? '' : val === false || val == null ? null : String(val);
            const currentVal = elem.hasAttribute(attrName) ? elem.getAttribute(attrName) : null;
            if (targetVal !== currentVal) {
              if (targetVal === null) {
                elem.removeAttribute(attrName);
              } else {
                elem.setAttribute(attrName, targetVal);
              }
            }
          }
          pc += 5;
          break;
        }
        case Opcode.CREATE_FRAGMENT:
        case Opcode.JUMP:
        case Opcode.EXEC_SCRIPT:
          pc += 2;
          break;
        case Opcode.INTERPOLATE_TEXT:
          pc += 3;
          break;
        case Opcode.LOOP_ITER:
          pc += 5;
          break;
        case Opcode.REACTIVE_IF:
          pc += 6;
          break;
        case Opcode.REACTIVE_FOR:
          pc += 7;
          break;
        default:
          return;
      }
    }
  }

  public execute(module: CompiledModule, options: VMExecutionOptions = {}): Node | null {
    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      throw new Error('DriftClientVirtualMachine requires a DOM Document context to execute.');
    }

    this.doc = doc;
    this.reactiveRegions = [];

    const scope: Record<string, any> = { ...options.scope };
    this.scope = scope;
    this.module = module;
    // Prefer the explicit declaredVars list emitted by the generator (contains ALL script-declared
    // variables). Fall back to deriving from reactiveBindings for hand-crafted test modules.
    if (module.declaredVars && module.declaredVars.length > 0) {
      this.declaredVars = new Set(module.declaredVars);
    } else {
      this.declaredVars = new Set(
        (module.reactiveBindings ?? []).map((b) => b.variable)
      );
    }
    this.registers.fill(undefined);

    return this.executeLoop(module.bytecode, module.constants, scope);
  }

  /**
   * Directly updates a single instruction at `pc` using persistent registers.
   */
  public updateAt(pc: number, module: CompiledModule, options: VMExecutionOptions = {}): void {
    const scope: Record<string, any> = options.scope ?? this.scope;
    const { bytecode, constants } = module;
    const opcode = bytecode[pc];

    switch (opcode) {
      case Opcode.INTERPOLATE_TEXT: {
        const dstReg = bytecode[pc + 1]!;
        const expr = constants[bytecode[pc + 2]!];
        const val = resolveValue(expr, scope, this.declaredVars);
        const existingNode = this.getRegister(dstReg);
        if (existingNode && existingNode.nodeType === 3) {
          existingNode.nodeValue = val != null ? String(val) : '';
        }
        break;
      }
      case Opcode.SET_ATTR: {
        const elem = this.getRegister(bytecode[pc + 1]!);
        const attrName = String(constants[bytecode[pc + 2]!]);
        const rawVal = constants[bytecode[pc + 3]!];
        const isDynamic = bytecode[pc + 4]!;
        const val = isDynamic === 1 ? resolveValue(rawVal, scope, this.declaredVars) : rawVal;

        if (elem && typeof elem.setAttribute === 'function') {
          if (val === true) {
            elem.setAttribute(attrName, '');
          } else if (val === false || val == null) {
            if (typeof elem.removeAttribute === 'function') elem.removeAttribute(attrName);
          } else {
            elem.setAttribute(attrName, String(val));
          }
        }
        break;
      }
    }
  }

  /**
   * Re-evaluates reactive bindings whose variables are in `changedVars`, updating the DOM in-place.
   * Also triggers re-render of reactive @if / @for regions whose deps intersect changedVars.
   */
  public triggerUpdates(changedVars: Set<string>): void {
    if (changedVars.size === 0) return;

    // 1. Patch INTERPOLATE_TEXT / SET_ATTR in-place (existing logic)
    if (this.module?.reactiveBindings) {
      for (const binding of this.module.reactiveBindings) {
        if (!changedVars.has(binding.variable)) continue;

        for (const pos of binding.positions) {
          if (pos.opcode === Opcode.INTERPOLATE_TEXT || pos.opcode === Opcode.SET_ATTR) {
            this.updateAt(pos.pc, this.module, { scope: this.scope });
          }
        }
      }
    }

    // 2. Re-render reactive @if / @for regions whose deps intersect changedVars.
    // Take a snapshot array because region.reRender() may remove stale child regions
    // from this.reactiveRegions, which would shift array indices during iteration.
    const regionsSnapshot = [...this.reactiveRegions];
    for (const region of regionsSnapshot) {
      if (!this.reactiveRegions.includes(region)) continue;
      for (const dep of region.deps) {
        if (changedVars.has(dep)) {
          region.reRender();
          break; // don't double-render the same region
        }
      }
    }
  }
}

/**
 * Mounts a compiled Drift component into an HTMLElement container.
 */
export function mount(component: CompiledModule, container: HTMLElement): void {
  const vm = new DriftClientVirtualMachine();
  const node = vm.execute(component);
  if (node != null) {
    container.appendChild(node);
  }
}
