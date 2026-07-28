import { CompiledModule, Opcode, ReactiveBinding } from '../../types/index.js';

export interface VMExecutionOptions {
  readonly scope?: Record<string, any>;
  readonly document?: Document;
}

interface LoopFrame {
  readonly pc: number;
  index: number;
  readonly items: any[];
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
      if (node.operator === '++') {
        scope[name] = arg + 1;
        return node.prefix ? scope[name] : arg;
      }
      if (node.operator === '--') {
        scope[name] = arg - 1;
        return node.prefix ? scope[name] : arg;
      }
      return undefined;
    }

    case 'MemberExpression': {
      const obj = evaluateExpression(node.object, scope, declaredVars);
      if (node.computed) {
        const prop = evaluateExpression(node.property, scope, declaredVars);
        return obj[prop];
      }
      return obj[node.property.name];
    }

    case 'CallExpression': {
      const callee = evaluateExpression(node.callee, scope, declaredVars);
      const args = node.arguments.map((arg: any) => evaluateExpression(arg, scope, declaredVars));
      if (node.callee.type === 'MemberExpression') {
        const thisObj = evaluateExpression(node.callee.object, scope, declaredVars);
        return callee.apply(thisObj, args);
      }
      return callee(...args);
    }

    case 'ConditionalExpression': {
      const test = evaluateExpression(node.test, scope, declaredVars);
      return test
        ? evaluateExpression(node.consequent, scope, declaredVars)
        : evaluateExpression(node.alternate, scope, declaredVars);
    }

    case 'AssignmentExpression': {
      const right = evaluateExpression(node.right, scope, declaredVars);
      if (node.left.type === 'Identifier') {
        scope[node.left.name] = right;
        return right;
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
      return node.elements.map((el: any) => evaluateExpression(el, scope, declaredVars));
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

    case 'ArrowFunctionExpression': {
      const capturedScope = scope;
      const capturedDeclaredVars = declaredVars;
      return (...args: any[]) => {
        const childScope = { ...scope };
        node.params.forEach((param: any, i: number) => {
          if (param.type === 'Identifier') {
            childScope[param.name] = args[i];
          }
        });
        const result = evaluateExpression(node.body, childScope, capturedDeclaredVars);
        if (capturedDeclaredVars && capturedDeclaredVars.size > 0) {
          for (const name of capturedDeclaredVars) {
            if (name in childScope && childScope[name] !== capturedScope[name]) {
              capturedScope[name] = childScope[name];
            }
          }
        }
        return result;
      };
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

    case 'VariableDeclaration': {
      for (const decl of node.declarations) {
        if (decl.id.type === 'Identifier') {
          scope[decl.id.name] = decl.init ? evaluateExpression(decl.init, scope, declaredVars) : undefined;
        }
      }
      return undefined;
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
 * Register-based Virtual Machine for executing compiled DriftJS templates.
 * Clean, lightweight, and 100% CSP compliant.
 */
export class DriftClientVirtualMachine {
  private static readonly MAX_REGISTERS = 256;
  private readonly registers: (Node | any)[] = new Array(DriftClientVirtualMachine.MAX_REGISTERS);
  private scope: Record<string, any> = {};
  private module: CompiledModule | null = null;
  private declaredVars: Set<string> = new Set();

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

  public execute(module: CompiledModule, options: VMExecutionOptions = {}): Node | null {
    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      throw new Error('DriftClientVirtualMachine requires a DOM Document context to execute.');
    }

    const scope: Record<string, any> = { ...options.scope };
    this.scope = scope;
    this.module = module;
    this.declaredVars = new Set(
      (module.reactiveBindings ?? []).map((b) => b.variable)
    );
    this.registers.fill(undefined);

    const { bytecode, constants } = module;
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
            if (attrName.startsWith('on') && typeof val === 'function' && typeof elem.addEventListener === 'function') {
              const eventName = attrName.slice(2).toLowerCase();
              const vm = this;
              const wrappedHandler = function (this: any, ...args: any[]) {
                const result = val.apply(this, args);
                vm.triggerUpdates();
                return result;
              };
              elem.addEventListener(eventName, wrappedHandler);
            } else if (attrName.startsWith('@') && typeof val === 'function' && typeof elem.addEventListener === 'function') {
              const eventName = attrName.slice(1).toLowerCase();
              const vm = this;
              const wrappedHandler = function (this: any, ...args: any[]) {
                const result = val.apply(this, args);
                vm.triggerUpdates();
                return result;
              };
              elem.addEventListener(eventName, wrappedHandler);
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

        default:
          throw new Error(`Unknown Opcode ${opcode} at PC ${pc}`);
      }
    }

    return null;
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
   * Re-evaluates all reactive bindings, updating the DOM in-place.
   */
  public triggerUpdates(): void {
    if (!this.module?.reactiveBindings) return;

    for (const binding of this.module.reactiveBindings) {
      if (!this.declaredVars.has(binding.variable)) continue;

      for (const pos of binding.positions) {
        if (pos.opcode === Opcode.INTERPOLATE_TEXT || pos.opcode === Opcode.SET_ATTR) {
          this.updateAt(pos.pc, this.module, { scope: this.scope });
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

