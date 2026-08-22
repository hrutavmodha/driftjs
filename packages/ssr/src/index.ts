import { type CompiledModule, Opcode } from "driftjs-compiler";
import {
  evaluateExpression,
  resolveComponentModule,
  evaluatePropsSpec,
  normalizeStyle,
  pushActiveVM,
  popActiveVM,
  createContext,
  provide,
  inject,
  provideContext,
  injectContext,
  type Context,
} from "driftjs-shared";
import type { SSRExecutionOptions, ServerNode } from "../types/index.js";

export * from "../types/index.js";
export {
  createContext,
  provide,
  inject,
  provideContext,
  injectContext,
  type Context,
};

/**
 * Escapes special HTML characters to prevent XSS.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const VALID_ATTR_NAME_REGEX = /^[a-zA-Z_:][a-zA-Z0-9_.:-]*$/;
const VALID_TAG_NAME_REGEX = /^[a-zA-Z_:][a-zA-Z0-9_.:-]*$/;

/**
 * Register-based Virtual Machine for Server-Side Rendering (SSR) in DriftJS.
 * Executes bytecode without DOM dependencies and serializes directly to HTML string.
 */
export class DriftServerVM {
  private static readonly MAX_REGISTERS = 256;
  private readonly registers: ServerNode[] = new Array(DriftServerVM.MAX_REGISTERS);
  private scope: Record<string, any> = {};
  private declaredVars: Set<string> = new Set();

  public parentVM: DriftServerVM | null = null;
  public contextMap = new Map<symbol | string, any>();

  private checkRegister(index: number): void {
    if (index < 0 || index >= DriftServerVM.MAX_REGISTERS) {
      throw new Error(`Register index ${index} out of bounds (0-${DriftServerVM.MAX_REGISTERS - 1})`);
    }
  }

  private setRegister(index: number, value: ServerNode): void {
    this.checkRegister(index);
    this.registers[index] = value;
  }

  private getRegister(index: number): any {
    this.checkRegister(index);
    return this.registers[index];
  }

  public execute(rawModule: CompiledModule, options: SSRExecutionOptions = {}): ServerNode | null {
    const module = (resolveComponentModule(rawModule) || rawModule) as CompiledModule;
    this.scope = options.scope ? options.scope : { ...module.scope };
    if (module.scope) {
      for (const k of Object.keys(module.scope)) {
        if (!Object.prototype.hasOwnProperty.call(this.scope, k)) {
          this.scope[k] = module.scope[k];
        }
      }
    }
    this.declaredVars = new Set(module.declaredVars ?? []);
    this.registers.fill(null as any);

    const bytecode = module.bytecode;
    const constants = module.constants;
    let pc = 0;

    pushActiveVM(this);
    try {
      while (pc < bytecode.length) {
        const opcode = bytecode[pc]!;

        switch (opcode) {
          case Opcode.RETURN: {
            const reg = bytecode[pc + 1]!;
            return this.getRegister(reg);
          }

          case Opcode.CREATE_ELEMENT: {
            const dstReg = bytecode[pc + 1]!;
            const tagIdx = bytecode[pc + 2]!;
            const tag = String(constants[tagIdx]);
            this.setRegister(dstReg, {
              type: 'element',
              tag,
              attrs: new Map(),
              children: [],
            });
            pc += 3;
            break;
          }

          case Opcode.MOUNT_COMPONENT: {
            const dstReg = bytecode[pc + 1]!;
            const tagIdx = bytecode[pc + 2]!;
            const propsSpecIdx = bytecode[pc + 3]!;
            const tag = String(constants[tagIdx]);

            const rawComp = (this.scope && tag in this.scope) ? this.scope[tag] : (typeof globalThis !== 'undefined' && (globalThis as any)[tag]);
            const compMod = resolveComponentModule(rawComp);
            if (compMod) {
              const propsSpec = propsSpecIdx !== 0xFF ? constants[propsSpecIdx] : null;
              const propsObj = evaluatePropsSpec(propsSpec, this.scope, this.declaredVars);
              const subVm = new DriftServerVM();
              subVm.parentVM = this;
              const compNode = subVm.execute(compMod, { scope: { ...this.scope, ...propsObj, props: propsObj } });
              if (compNode) this.setRegister(dstReg, compNode);
            }
            pc += 4;
            break;
          }

        case Opcode.CREATE_TEXT: {
          const dstReg = bytecode[pc + 1]!;
          const textIdx = bytecode[pc + 2]!;
          const textConst = constants[textIdx];
          const val = evaluateExpression(textConst, this.scope, this.declaredVars);
          const content = val != null ? String(val) : '';
          this.setRegister(dstReg, {
            type: 'text',
            content,
            children: [],
          });
          pc += 3;
          break;
        }

        case Opcode.CREATE_COMMENT: {
          const dstReg = bytecode[pc + 1]!;
          const commentIdx = bytecode[pc + 2]!;
          const content = String(constants[commentIdx]);
          this.setRegister(dstReg, {
            type: 'comment',
            content,
            children: [],
          });
          pc += 3;
          break;
        }

        case Opcode.CREATE_FRAGMENT: {
          const dstReg = bytecode[pc + 1]!;
          this.setRegister(dstReg, {
            type: 'fragment',
            children: [],
          });
          pc += 2;
          break;
        }

        case Opcode.APPEND_CHILD: {
          const parentReg = bytecode[pc + 1]!;
          const childReg = bytecode[pc + 2]!;
          const parentNode = this.getRegister(parentReg);
          const childNode = this.getRegister(childReg);
          parentNode.children.push(childNode);
          pc += 3;
          break;
        }

        case Opcode.SET_ATTR: {
          const elemReg = bytecode[pc + 1]!;
          const nameIdx = bytecode[pc + 2]!;
          const valIdx = bytecode[pc + 3]!;
          const isDynamic = bytecode[pc + 4]!;

          const elemNode = this.getRegister(elemReg);
          const attrName = String(constants[nameIdx]);
          if (attrName.startsWith('on')) {
            pc += 5;
            break;
          }

          const rawVal = constants[valIdx];
          let val = isDynamic === 1 ? evaluateExpression(rawVal, this.scope, this.declaredVars) : rawVal;
          if (attrName === 'style') {
            val = normalizeStyle(val);
          }

          if (!elemNode.attrs) elemNode.attrs = new Map();
          elemNode.attrs.set(attrName, val);
          pc += 5;
          break;
        }

        case Opcode.INTERPOLATE_TEXT: {
          const dstReg = bytecode[pc + 1]!;
          const exprIdx = bytecode[pc + 2]!;
          const expr = constants[exprIdx];
          const val = evaluateExpression(expr, this.scope, this.declaredVars);
          const content = val != null ? String(val) : '';
          this.setRegister(dstReg, {
            type: 'text',
            content,
            children: [],
          });
          pc += 3;
          break;
        }



        case Opcode.EXEC_SCRIPT: {
          const scriptIdx = bytecode[pc + 1]!;
          const scriptAst = constants[scriptIdx];
          if (Array.isArray(scriptAst)) {
            for (const stmt of scriptAst) {
              evaluateExpression(stmt, this.scope, this.declaredVars);
            }
          } else if (scriptAst) {
            evaluateExpression(scriptAst, this.scope, this.declaredVars);
          }
          pc += 2;
          break;
        }

        case Opcode.REACTIVE_IF: {
          const parentReg = bytecode[pc + 1]!;
          const condIdx = bytecode[pc + 2]!;
          const consIdx = bytecode[pc + 3]!;
          const altIdx = bytecode[pc + 4]!;

          const parentNode = this.getRegister(parentReg);
          const condExpr = constants[condIdx];
          const consMod = constants[consIdx];
          const altMod = altIdx !== 0xFF ? constants[altIdx] : null;

          const cond = evaluateExpression(condExpr, this.scope, this.declaredVars);
          const subMod = cond ? consMod : altMod;

          parentNode.children.push({ type: 'comment', content: 'if', children: [] });
          if (subMod) {
            const subVm = new DriftServerVM();
            subVm.parentVM = this;
            const subResult = subVm.execute(subMod, { scope: this.scope });
            if (subResult) parentNode.children.push(subResult);
          }
          parentNode.children.push({ type: 'comment', content: '/if', children: [] });
          pc += 6;
          break;
        }

        case Opcode.REACTIVE_FOR: {
          const parentReg = bytecode[pc + 1]!;
          const iterIdx = bytecode[pc + 2]!;
          const itemNameIdx = bytecode[pc + 3]!;
          const idxNameIdx = bytecode[pc + 4]!;
          const keyIdx = bytecode[pc + 5]!;
          const bodyIdx = bytecode[pc + 6]!;

          const parentNode = this.getRegister(parentReg);
          const iterExpr = constants[iterIdx];
          const itemName = constants[itemNameIdx] as string;
          const indexName = idxNameIdx !== 0xFF ? constants[idxNameIdx] as string : null;
          const bodyMod = constants[bodyIdx];

          const rawIter = evaluateExpression(iterExpr, this.scope, this.declaredVars);
          const items = Array.isArray(rawIter)
            ? rawIter
            : rawIter && typeof rawIter[Symbol.iterator] === 'function'
            ? Array.from(rawIter)
            : [];

          parentNode.children.push({ type: 'comment', content: 'for', children: [] });
          for (let i = 0; i < items.length; i++) {
            const childScope = Object.create(this.scope);
            childScope[itemName] = items[i];
            if (indexName) childScope[indexName] = i;

            const subVm = new DriftServerVM();
            subVm.parentVM = this;
            const subResult = subVm.execute(bodyMod, { scope: childScope });
            if (subResult) parentNode.children.push(subResult);
          }
          parentNode.children.push({ type: 'comment', content: '/for', children: [] });
          pc += 8;
          break;
        }

        default:
          throw new Error(`DriftServerVM: Unknown Opcode ${opcode} at PC ${pc}`);
      }
    }

    return null;
  } finally {
    popActiveVM();
  }
}
}


function sanitizeRawContent(content: string, rawTag?: string): string {
  if (!rawTag) return content;
  const lower = rawTag.toLowerCase();
  if (lower === 'script') {
    return content.replace(/<\/script/gi, '<\\/script');
  }
  if (lower === 'style') {
    return content.replace(/<\/style/gi, '<\\/style');
  }
  return content;
}

/**
 * Serializes a ServerNode tree directly into an HTML string.
 */
export function serializeNode(node: ServerNode | string, isRawText = false, rawTag?: string): string {
  if (typeof node === 'string') return isRawText ? sanitizeRawContent(node, rawTag) : escapeHtml(node);
  if (node.type === 'text') return isRawText ? sanitizeRawContent(node.content ?? '', rawTag) : escapeHtml(node.content ?? '');
  if (node.type === 'comment') return `<!--${node.content ?? ''}-->`;
  if (node.type === 'fragment') {
    return node.children.map((c) => serializeNode(c, isRawText, rawTag)).join('');
  }
  if (node.type === 'element') {
    const tag = node.tag!;
    if (!tag || !VALID_TAG_NAME_REGEX.test(tag)) {
      return '';
    }
    const isRaw = tag.toLowerCase() === 'script' || tag.toLowerCase() === 'style';
    let attrsStr = '';
    if (node.attrs && node.attrs.size > 0) {
      for (const [k, v] of node.attrs.entries()) {
        if (!VALID_ATTR_NAME_REGEX.test(k)) {
          continue;
        }
        if (k === 'style' && (v === '' || v == null || v === false)) {
          continue;
        }
        if (v === '' || v === true) {
          attrsStr += ` ${k}`;
        } else if (v !== null && v !== undefined && v !== false) {
          attrsStr += ` ${k}="${escapeHtml(String(v))}"`;
        }
      }
    }
    const selfClosing = VOID_ELEMENTS.has(tag.toLowerCase());
    if (selfClosing) {
      return `<${tag}${attrsStr} />`;
    }
    const childrenStr = node.children.map((c) => serializeNode(c, isRaw, isRaw ? tag : undefined)).join('');
    return `<${tag}${attrsStr}>${childrenStr}</${tag}>`;
  }
  return '';
}

/**
 * Renders a compiled Drift component to an HTML string.
 */
export function renderToString(component: CompiledModule, options: SSRExecutionOptions = {}): string {
  const vm = new DriftServerVM();
  const rootNode = vm.execute(component, options);
  return rootNode ? serializeNode(rootNode) : '';
}
