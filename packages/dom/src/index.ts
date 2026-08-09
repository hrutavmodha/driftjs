import type {
  CompiledModule,
  ReactiveBinding,
  ItemRecord,
  VMExecutionOptions,
  LoopFrame,
  ReactiveRegion,
} from "../types/index.js";
import { Opcode } from "../types/index.js";
import { reconcileKeyedList } from "./reconciler.js";
import { HydrationCursor } from "./hydration.js";
import {
  MAX_REGISTERS,
  setScopeValue,
  evaluateExpression,
  executeBlockStatement,
  resolveIterable,
  resolveComponentModule,
} from "@driftjs/utils";


/**
 * Removes all DOM nodes situated strictly between startAnchor and endAnchor comments.
 */
function clearBetweenAnchors(startAnchor: Node, endAnchor: Node): void {
  const parent = startAnchor.parentNode;
  if (!parent) return;
  let curr = startAnchor.nextSibling;
  while (curr && curr !== endAnchor) {
    const next = curr.nextSibling;
    parent.removeChild(curr);
    curr = next;
  }
}

/**
 * Register-based Virtual Machine for executing compiled DriftJS templates.
 * Clean, lightweight, and 100% CSP compliant.
 */
export class DriftClientVM {
  private static readonly MAX_REGISTERS = 256;
  private readonly registers: (Node | any)[] = new Array(DriftClientVM.MAX_REGISTERS);
  private scope: Record<string, any> = {};
  private module: CompiledModule | null = null;
  private declaredVars: Set<string> = new Set();
  private doc: Document | null = null;
  private reactiveRegions: ReactiveRegion[] = [];
  private delegatedEvents = new Set<string>();
  private eventHandlersMap = new WeakMap<Node, Record<string, (e: Event) => void>>();
  private cursor: HydrationCursor | null = null;

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
    if (index < 0 || index >= DriftClientVM.MAX_REGISTERS) {
      throw new Error(`Register index ${index} out of bounds (0-${DriftClientVM.MAX_REGISTERS - 1})`);
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
    rawSubMod: { bytecode: readonly number[]; constants: readonly any[] },
    scope: Record<string, any>
  ): Node | null {
    const subMod = (resolveComponentModule(rawSubMod) || rawSubMod) as CompiledModule;
    const savedRegisters = [...this.registers];
    const savedModule = this.module;
    const savedDeclaredVars = this.declaredVars;

    this.registers.fill(undefined);
    this.module = subMod;
    if (subMod.declaredVars && subMod.declaredVars.length > 0) {
      this.declaredVars = new Set(subMod.declaredVars);
    }

    const subScope = subMod.scope && Object.keys(subMod.scope).length > 0 ? { ...subMod.scope, ...scope } : scope;
    const result = this.executeLoop(subMod.bytecode, subMod.constants, subScope);

    this.registers.fill(undefined);
    for (let i = 0; i < savedRegisters.length; i++) this.registers[i] = savedRegisters[i];
    this.module = savedModule;
    this.declaredVars = savedDeclaredVars;
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
          const tag = String(constants[bytecode[pc + 2]!]);
          const rawComp = (scope && tag in scope) ? scope[tag] : (typeof globalThis !== 'undefined' && (globalThis as any)[tag]);
          const compMod = resolveComponentModule(rawComp);
          if (compMod) {
            const compNode = this.runSubModule(compMod, scope);
            this.setRegister(dstReg, compNode);
          } else {
            const elem = this.cursor ? this.cursor.claimElement(tag, doc) : doc.createElement(tag);
            this.setRegister(dstReg, elem);
          }
          pc += 3;
          break;
        }

        case Opcode.CREATE_TEXT: {
          const dstReg = bytecode[pc + 1]!;
          const text = constants[bytecode[pc + 2]!];
          const val = evaluateExpression(text, scope, this.declaredVars);
          const textNode = this.cursor ? this.cursor.claimText(doc) : doc.createTextNode(val != null ? String(val) : '');
          this.setRegister(dstReg, textNode);
          pc += 3;
          break;
        }

        case Opcode.CREATE_COMMENT: {
          const dstReg = bytecode[pc + 1]!;
          const comment = String(constants[bytecode[pc + 2]!] ?? '');
          const commentNode = this.cursor ? this.cursor.claimComment(comment, doc) : doc.createComment(comment);
          this.setRegister(dstReg, commentNode);
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
            if (!this.cursor || (child.parentNode !== parent && parent.nodeType !== 11)) {
              parent.appendChild(child);
            }
          }
          pc += 3;
          break;
        }

        case Opcode.SET_ATTR: {
          const elem = this.getRegister(bytecode[pc + 1]!);
          const attrName = String(constants[bytecode[pc + 2]!]);
          const rawVal = constants[bytecode[pc + 3]!];
          const isDynamic = bytecode[pc + 4]!;
          const val = isDynamic === 1 ? evaluateExpression(rawVal, scope, this.declaredVars) : rawVal;

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
          const val = evaluateExpression(expr, scope, this.declaredVars);
          const textNode = this.cursor ? this.cursor.claimText(doc) : doc.createTextNode(val != null ? String(val) : '');
          textNode.nodeValue = val != null ? String(val) : '';
          this.setRegister(dstReg, textNode);
          pc += 3;
          break;
        }

        case Opcode.EVAL_EXPR: {
          const dstReg = bytecode[pc + 1]!;
          const expr = constants[bytecode[pc + 2]!];
          this.setRegister(dstReg, evaluateExpression(expr, scope, this.declaredVars));
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
          const depsRaw    = constants[depsIdx];
          const deps       = new Set<string>(Array.isArray(depsRaw) ? depsRaw : []);

          const startAnchor = this.cursor ? this.cursor.claimComment('if', doc) : doc.createComment('if');
          if (!startAnchor.parentNode || startAnchor.parentNode !== parentElem) {
            parentElem.appendChild(startAnchor);
          }

          let actualEndAnchor: Comment = !this.cursor ? doc.createComment('/if') : (null as any);
          if (actualEndAnchor) {
            parentElem.appendChild(actualEndAnchor);
          }

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
            if (actualEndAnchor && startAnchor.parentNode) {
              clearBetweenAnchors(startAnchor, actualEndAnchor);
            }
            const before = vm.reactiveRegions.length;
            const cond = evaluateExpression(condExpr, scope, vm.declaredVars);
            const subMod = cond ? consMod : altMod;
            if (subMod) {
              const frag = vm.runSubModule(subMod, scope);
              if (frag) {
                if (actualEndAnchor && actualEndAnchor.parentNode) {
                  actualEndAnchor.parentNode.insertBefore(frag, actualEndAnchor);
                } else {
                  parentElem.appendChild(frag);
                }
              }
            }
            childRegions = vm.reactiveRegions.slice(before);
          };
          renderIf();

          if (this.cursor) {
            actualEndAnchor = this.cursor.claimComment('/if', doc);
            if (!actualEndAnchor.parentNode || actualEndAnchor.parentNode !== parentElem) {
              parentElem.appendChild(actualEndAnchor);
            }
          }

          this.reactiveRegions.push({
            deps,
            reRender: () => {
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
          const keyIdx      = bytecode[pc + 5]!;
          const bodyIdx     = bytecode[pc + 6]!;
          const depsIdx     = bytecode[pc + 7]!;

          const parentElem  = this.getRegister(parentReg);
          const iterExpr    = constants[iterIdx];
          const itemName    = constants[itemNameIdx] as string;
          const indexName   = idxNameIdx !== 0xFF ? constants[idxNameIdx] as string : null;
          const keyExpr     = keyIdx !== 0xFF ? constants[keyIdx] : null;
          const bodyMod     = constants[bodyIdx];
          const depsRaw     = constants[depsIdx];
          const deps        = new Set<string>(Array.isArray(depsRaw) ? depsRaw : []);
          const forCacheRef: { cache: ItemRecord[] } = { cache: [] };

          const startAnchor = this.cursor ? this.cursor.claimComment('for', doc) : doc.createComment('for');
          if (!startAnchor.parentNode || startAnchor.parentNode !== parentElem) {
            parentElem.appendChild(startAnchor);
          }

          let actualEndAnchor: Comment = !this.cursor ? doc.createComment('/for') : (null as any);
          if (actualEndAnchor) {
            parentElem.appendChild(actualEndAnchor);
          }

          const vm = this;
          const renderFor = () => {
            const rawIter = evaluateExpression(iterExpr, scope, vm.declaredVars);
            const items = Array.isArray(rawIter)
              ? rawIter
              : rawIter && typeof rawIter[Symbol.iterator] === 'function'
              ? Array.from(rawIter)
              : [];

            reconcileKeyedList(
              (actualEndAnchor && actualEndAnchor.parentNode) || parentElem,
              actualEndAnchor,
              forCacheRef,
              items,
              (itemVal, indexVal) => {
                if (keyExpr) {
                  const itemScope = Object.create(scope);
                  itemScope[itemName] = itemVal;
                  if (indexName) itemScope[indexName] = indexVal;
                  return evaluateExpression(keyExpr, itemScope, vm.declaredVars);
                }
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

                if (frag) {
                  if (refNode && refNode.parentNode) {
                    refNode.parentNode.insertBefore(frag, refNode);
                  } else {
                    parentElem.appendChild(frag);
                  }
                }

                const itemKey = keyExpr
                  ? evaluateExpression(keyExpr, childScope, vm.declaredVars)
                  : itemVal && typeof itemVal === 'object'
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
                    for (const attr of Array.from(elem.attributes)) {
                      elem.removeAttribute(attr.name);
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

          if (this.cursor) {
            actualEndAnchor = this.cursor.claimComment('/for', doc);
          }
          if (!actualEndAnchor.parentNode || actualEndAnchor.parentNode !== parentElem) {
            parentElem.appendChild(actualEndAnchor);
          }

          this.reactiveRegions.push({
            deps,
            reRender: () => {
              renderFor();
            },
          });

          pc += 8;
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
            const val = evaluateExpression(rawVal, childScope, this.declaredVars);
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
          pc += 8;
          break;
        default:
          return;
      }
    }
  }

  public execute(rawModule: CompiledModule, options: VMExecutionOptions = {}): Node | null {
    const module = (resolveComponentModule(rawModule) || rawModule) as CompiledModule;
    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      throw new Error('DriftClientVM requires a DOM Document context to execute.');
    }

    this.doc = doc;
    this.reactiveRegions = [];

    if (options.hydrate && options.container) {
      this.cursor = new HydrationCursor(options.container, doc);
    } else {
      this.cursor = null;
    }

    const scope: Record<string, any> = { ...module.scope, ...options.scope };
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

    const result = this.executeLoop(module.bytecode, module.constants, scope);
    this.cursor = null;
    return result;
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
        const val = evaluateExpression(expr, scope, this.declaredVars);
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
        const val = isDynamic === 1 ? evaluateExpression(rawVal, scope, this.declaredVars) : rawVal;

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
  const vm = new DriftClientVM();
  const node = vm.execute(component);
  if (node != null) {
    container.appendChild(node);
  }
}

/**
 * Hydrates pre-rendered SSR HTML inside an HTMLElement container.
 */
export function hydrate(component: CompiledModule, container: HTMLElement, options: VMExecutionOptions = {}): DriftClientVM {
  const vm = new DriftClientVM();
  vm.execute(component, { ...options, container, hydrate: true });
  return vm;
}

export * from "../types/index.js";
