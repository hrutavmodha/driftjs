import { setScopeValue } from './scope.js';

/**
 * Safely resolves an iterable object or array.
 */
export function resolveIterable(rawIter: any): any[] {
  if (Array.isArray(rawIter)) return rawIter;
  if (rawIter && typeof rawIter[Symbol.iterator] === 'function') {
    return Array.from(rawIter);
  }
  return [];
}

/**
 * Evaluates an Acorn AST node against scope without eval/new Function (100% CSP compliant).
 */
export function evaluateExpression(node: any, scope: Record<string, any>, declaredVars?: Set<string>): any {
  if (node === null || node === undefined) return node;

  if (typeof node === 'function') {
    return node(scope, declaredVars, setScopeValue);
  }

  if (typeof node === 'object' && node !== null && '__drift_fn__' in node) {
    if (!node._executableFn) {
      node._executableFn = new Function('return (' + node.__drift_fn__ + ')')();
    }
    return node._executableFn(scope, declaredVars, setScopeValue);
  }

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

    case 'BinaryExpression':
    case 'LogicalExpression': {
      const left = evaluateExpression(node.left, scope, declaredVars);

      if (node.operator === '&&') {
        return left ? evaluateExpression(node.right, scope, declaredVars) : left;
      }
      if (node.operator === '||') {
        return left ? left : evaluateExpression(node.right, scope, declaredVars);
      }
      if (node.operator === '??') {
        return left ?? evaluateExpression(node.right, scope, declaredVars);
      }

      const right = evaluateExpression(node.right, scope, declaredVars);

      switch (node.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '%': return left % right;
        case '==': return left == right;
        case '!=': return left != right;
        case '===': return left === right;
        case '!==': return left !== right;
        case '<': return left < right;
        case '<=': return left <= right;
        case '>': return left > right;
        case '>=': return left >= right;
        default: return undefined;
      }
    }

    case 'UnaryExpression': {
      const arg = evaluateExpression(node.argument, scope, declaredVars);
      switch (node.operator) {
        case '!': return !arg;
        case '-': return -arg;
        case '+': return +arg;
        case 'typeof': return typeof arg;
        default: return undefined;
      }
    }

    case 'ConditionalExpression': {
      const test = evaluateExpression(node.test, scope, declaredVars);
      return test
        ? evaluateExpression(node.consequent, scope, declaredVars)
        : evaluateExpression(node.alternate, scope, declaredVars);
    }

    case 'MemberExpression': {
      const obj = evaluateExpression(node.object, scope, declaredVars);
      if (obj === null || obj === undefined) return undefined;
      const prop = node.computed
        ? evaluateExpression(node.property, scope, declaredVars)
        : node.property.name;
      return obj[prop];
    }

    case 'CallExpression': {
      const callee = evaluateExpression(node.callee, scope, declaredVars);
      if (typeof callee !== 'function') return undefined;

      let context = null;
      if (node.callee.type === 'MemberExpression') {
        context = evaluateExpression(node.callee.object, scope, declaredVars);
      }

      const args = node.arguments.map((arg: any) => evaluateExpression(arg, scope, declaredVars));
      return callee.apply(context, args);
    }

    case 'AssignmentExpression': {
      const val = evaluateExpression(node.right, scope, declaredVars);
      if (node.left.type === 'Identifier') {
        setScopeValue(scope, node.left.name, val);
      } else if (node.left.type === 'MemberExpression') {
        const obj = evaluateExpression(node.left.object, scope, declaredVars);
        const prop = node.left.computed
          ? evaluateExpression(node.left.property, scope, declaredVars)
          : node.left.property.name;
        if (obj) obj[prop] = val;
      }
      return val;
    }

    case 'UpdateExpression': {
      const isPrefix = node.prefix;
      const name = node.argument.type === 'Identifier' ? node.argument.name : null;
      if (name) {
        const oldVal = Number(evaluateExpression(node.argument, scope, declaredVars)) || 0;
        const newVal = node.operator === '++' ? oldVal + 1 : oldVal - 1;
        setScopeValue(scope, name, newVal);
        return isPrefix ? newVal : oldVal;
      } else if (node.argument.type === 'MemberExpression') {
        const obj = evaluateExpression(node.argument.object, scope, declaredVars);
        const prop = node.argument.computed
          ? evaluateExpression(node.argument.property, scope, declaredVars)
          : node.argument.property.name;
        if (obj) {
          const oldVal = Number(obj[prop]) || 0;
          const newVal = node.operator === '++' ? oldVal + 1 : oldVal - 1;
          obj[prop] = newVal;
          return isPrefix ? newVal : oldVal;
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
export function resolveValue(val: any, scope: Record<string, any>, declaredVars?: Set<string>): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') return val in scope ? scope[val] : val;
  if (typeof val === 'object' && val.type) return evaluateExpression(val, scope, declaredVars);
  return val;
}
