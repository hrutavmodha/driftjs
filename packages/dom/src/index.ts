import type {
  CompiledModule,
  ReactiveBinding,
  ItemRecord,
  VMExecutionOptions,
  ReactiveRegion,
} from "../types/index.js";
import { Opcode } from "../types/index.js";
import { reconcileKeyedList } from "./reconciler.js";
import { HydrationCursor } from "./hydration.js";
import {
  MAX_REGISTERS,
  setScopeValue,
  evaluateExpression,
  resolveIterable,
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


/**
 * Removes all DOM nodes situated strictly between startAnchor and endAnchor comments.
 */
function clearBetweenAnchors(startAnchor: Node, endAnchor: Node): void {
  const parent = startAnchor.parentNode;
  if (!parent) return;
  let curr = startAnchor.nextSibling;
  while (curr && curr !== endAnchor) {
    const next = curr ? curr.nextSibling : null;
    if (curr && curr.parentNode === parent) {
      parent.removeChild(curr);
    }
    curr = next;
  }
}

/**
 * Register-based Virtual Machine for executing compiled DriftJS templates.
 * Clean, lightweight, and 100% CSP compliant.
 */
export class DriftClientVM {
  private static readonly MAX_REGISTERS = 256;
  private static activeVMCount = 0;
  private static globalDelegatedListeners = new Map<string, (e: Event) => void>();

  private readonly registers: (Node | any)[] = new Array(DriftClientVM.MAX_REGISTERS);
  public scope: Record<string, any> = {};
  private module: CompiledModule | null = null;
  private declaredVars: Set<string> = new Set();
  private doc: Document | null = null;
  private reactiveRegions: ReactiveRegion[] = [];
  private reactiveRegionsIndex = new Map<string, Set<ReactiveRegion>>();
  private delegatedEvents = new Set<string>();
  private static eventHandlersMap = new WeakMap<Node, Record<string, (e: Event) => void>>();
  private cursor: HydrationCursor | null = null;
  private childVMs = new WeakMap<Node, { vm: DriftClientVM; scope: Record<string, any>; propsSpec: any }>();
  private pendingDirtyVars = new Set<string>();
  private isUpdateScheduled = false;

  public parentVM: DriftClientVM | null = null;
  public contextMap = new Map<symbol | string, any>();

  constructor() {
    DriftClientVM.activeVMCount++;
  }

  public registerRegion(region: ReactiveRegion): void {
    this.reactiveRegions.push(region);
    for (const dep of region.deps) {
      let set = this.reactiveRegionsIndex.get(dep);
      if (!set) {
        set = new Set<ReactiveRegion>();
        this.reactiveRegionsIndex.set(dep, set);
      }
      set.add(region);
    }
  }

  public removeRegion(region: ReactiveRegion): void {
    if (region.childRegions) {
      for (const child of region.childRegions) {
        this.removeRegion(child);
      }
      region.childRegions = [];
    }

    for (const dep of region.deps) {
      const set = this.reactiveRegionsIndex.get(dep);
      if (set) {
        set.delete(region);
        if (set.size === 0) this.reactiveRegionsIndex.delete(dep);
      }
    }

    const idx = this.reactiveRegions.indexOf(region);
    if (idx !== -1) {
      this.reactiveRegions.splice(idx, 1);
    }
  }

  public unmount(): void {
    if (DriftClientVM.activeVMCount > 0) {
      DriftClientVM.activeVMCount--;
    }

    for (const region of [...this.reactiveRegions]) {
      this.removeRegion(region);
    }
    this.reactiveRegions = [];
    this.reactiveRegionsIndex.clear();

    if (DriftClientVM.activeVMCount === 0 && DriftClientVM.globalDelegatedListeners.size > 0) {
      const root = this.doc || (typeof document !== 'undefined' ? document : null);
      if (root) {
        for (const [eventName, listener] of DriftClientVM.globalDelegatedListeners.entries()) {
          root.removeEventListener(eventName, listener);
        }
      }
      DriftClientVM.globalDelegatedListeners.clear();
    }

    DriftClientVM.eventHandlersMap = new WeakMap();
    this.registers.fill(null);
    this.pendingDirtyVars.clear();
    this.isUpdateScheduled = false;
    this.scope = {};
    this.module = null;
    this.contextMap.clear();
    this.parentVM = null;
  }

  public markDirty(varName: string): void {
    this.pendingDirtyVars.add(varName);
    if (!this.isUpdateScheduled) {
      this.isUpdateScheduled = true;
      queueMicrotask(() => this.flushUpdates());
    }
  }

  private flushUpdates(): void {
    this.isUpdateScheduled = false;
    if (this.pendingDirtyVars.size === 0) return;
    const dirty = new Set(this.pendingDirtyVars);
    this.pendingDirtyVars.clear();
    this.triggerUpdates(dirty);
  }

  private updateChildComponentProps(childScope: Record<string, any>, childVM: DriftClientVM, newPropsObj: Record<string, any>): void {
    const oldProps = childScope.props || {};
    childScope.props = newPropsObj;

    const dirtyPropVars = new Set<string>();

    for (const key of Object.keys(newPropsObj)) {
      if (key === '__drift_props__') continue;
      const newVal = newPropsObj[key];
      const oldVal = oldProps[key];
      if (newVal !== oldVal) {
        setScopeValue(childScope, key, newVal);
        dirtyPropVars.add(key);
      }
    }

    if (dirtyPropVars.size > 0) {
      dirtyPropVars.add('props');
      if (childVM) {
        childVM.triggerUpdates(dirtyPropVars);
      }
    }
  }

  private ensureEventDelegated(eventName: string): void {
    if (this.delegatedEvents.has(eventName)) return;
    this.delegatedEvents.add(eventName);

    const root = this.doc || (typeof document !== 'undefined' ? document : null);
    if (!root) return;

    if (!DriftClientVM.globalDelegatedListeners.has(eventName)) {
      const listener = (e: Event) => {
        let curr = e.target as Node | null;
        while (curr && curr !== root) {
          if (curr.nodeType === 1) {
            const handlers = DriftClientVM.eventHandlersMap.get(curr);
            if (handlers && handlers[eventName]) {
              handlers[eventName](e);
              break;
            }
          }
          curr = curr.parentNode;
        }
      };
      root.addEventListener(eventName, listener);
      DriftClientVM.globalDelegatedListeners.set(eventName, listener);
    }
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
    rawSubMod: { bytecode: readonly number[] | Uint32Array; constants: readonly any[] },
    scope: Record<string, any>
  ): DocumentFragment | null {
    const subMod = (resolveComponentModule(rawSubMod) || rawSubMod) as CompiledModule;
    const savedRegisters = [...this.registers];
    const savedModule = this.module;
    const savedDeclaredVars = this.declaredVars;

    this.registers.fill(undefined);
    this.module = subMod;
    if (subMod.declaredVars && subMod.declaredVars.length > 0) {
      this.declaredVars = new Set(subMod.declaredVars);
    }

    const result = this.executeLoop(subMod.bytecode, subMod.constants, scope) as DocumentFragment | null;

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
    bytecode: readonly number[] | Uint32Array,
    constants: readonly any[],
    scope: Record<string, any>
  ): Node | null {
    const doc = this.doc!;
    let pc = 0;

    while (pc < bytecode.length) {
      const opcode = bytecode[pc];

      switch (opcode) {
        case Opcode.RETURN: {
          return this.getRegister(bytecode[pc + 1]!) as Node | null;
        }

        case Opcode.CREATE_ELEMENT: {
          const dstReg = bytecode[pc + 1]!;
          const tagConstIdx = bytecode[pc + 2]!;
          const tag = String(constants[tagConstIdx]);
          const elem = this.cursor ? this.cursor.claimElement(tag, doc) : doc.createElement(tag);
          this.setRegister(dstReg, elem);
          pc += 3;
          break;
        }

        case Opcode.MOUNT_COMPONENT: {
          const dstReg = bytecode[pc + 1]!;
          const tagConstIdx = bytecode[pc + 2]!;
          const propsSpecIdx = bytecode[pc + 3]!;
          const tag = String(constants[tagConstIdx]);

          const rawComp = (scope && tag in scope) ? scope[tag] : (typeof globalThis !== 'undefined' && (globalThis as any)[tag]);
          const compMod = resolveComponentModule(rawComp);
          if (compMod) {
            const propsSpec = propsSpecIdx !== 0xFF ? constants[propsSpecIdx] : null;
            const propsObj = evaluatePropsSpec(propsSpec, scope, this.declaredVars);
            const childVM = new DriftClientVM();
            childVM.parentVM = this;
            const propsScope = Object.assign(Object.create(scope), { props: propsObj }, propsObj);
            const compNode = childVM.execute(compMod, { scope: propsScope, document: doc });
            this.updateChildComponentProps(childVM.scope, childVM, propsObj);
            if (compNode) {
              this.childVMs.set(compNode, { vm: childVM, scope: childVM.scope, propsSpec });
              this.setRegister(dstReg, compNode);
            }
          }
          pc += 4;
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
          let val = isDynamic === 1 ? evaluateExpression(rawVal, scope, this.declaredVars) : rawVal;

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
                if (vm.pendingDirtyVars.size > 0) vm.flushUpdates();
                return result;
              };

              let handlers = DriftClientVM.eventHandlersMap.get(elem);
              if (!handlers) {
                handlers = {};
                DriftClientVM.eventHandlersMap.set(elem, handlers);
              }
              handlers[eventName] = wrappedHandler;
              this.ensureEventDelegated(eventName);
            } else {
              if (attrName === 'style') {
                val = normalizeStyle(val);
              }
              if (attrName in elem && (attrName === 'value' || attrName === 'checked' || attrName === 'selected' || attrName === 'disabled')) {
                (elem as any)[attrName] = val ?? '';
              }
              if (typeof elem.setAttribute === 'function') {
                if (val === true) {
                  elem.setAttribute(attrName, '');
                } else if (val === false || val == null || (attrName === 'style' && val === '')) {
                  if (typeof elem.removeAttribute === 'function') elem.removeAttribute(attrName);
                } else {
                  elem.setAttribute(attrName, String(val));
                }
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
            for (const r of childRegions) {
              vm.removeRegion(r);
            }
            childRegions = [];
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

          const ifRegion: ReactiveRegion = {
            deps,
            reRender: () => {
              renderIf();
            },
            childRegions,
          };
          this.registerRegion(ifRegion);

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
          const removeItem = (record: ItemRecord) => {
            if (record.childRegions && record.childRegions.length > 0) {
              for (const r of record.childRegions) {
                vm.removeRegion(r);
              }
              record.childRegions = [];
            }
          };

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
                return indexVal;
              },
              (itemVal, indexVal, refNode) => {
                const childScope = Object.create(scope);
                childScope[itemName] = itemVal;
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
                    vm.removeRegion(r);
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
              },
              removeItem
            );
          };
          renderFor();

          if (this.cursor) {
            actualEndAnchor = this.cursor.claimComment('/for', doc);
          }
          if (!actualEndAnchor.parentNode || actualEndAnchor.parentNode !== parentElem) {
            parentElem.appendChild(actualEndAnchor);
          }

          const forRegion: ReactiveRegion = {
            deps,
            reRender: () => {
              renderFor();
            },
          };
          this.registerRegion(forRegion);

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
          pc += 3;
          break;
        case Opcode.MOUNT_COMPONENT:
          pc += 4;
          break;
        case Opcode.CREATE_TEXT:
        case Opcode.CREATE_COMMENT:
        case Opcode.APPEND_CHILD:
        case Opcode.INTERPOLATE_TEXT:
          pc += 3;
          break;
        case Opcode.SET_ATTR: {
          const attrName = String(constants[bytecode[pc + 2]!]);
          const rawVal = constants[bytecode[pc + 3]!];
          const isDynamic = bytecode[pc + 4]!;
          if (isDynamic === 1) {
            let val = evaluateExpression(rawVal, childScope, this.declaredVars);
            if (attrName === 'style') {
              val = normalizeStyle(val);
            }
            const targetVal = val === true ? '' : val === false || val == null || (attrName === 'style' && val === '') ? null : String(val);
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
        case Opcode.EXEC_SCRIPT:
          pc += 2;
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

    const parentOptionsScope = options.scope || null;
    const scope: Record<string, any> = Object.assign(
      Object.create(parentOptionsScope),
      module.scope
    );
    Object.defineProperty(scope, '__drift_mark_dirty__', {
      value: (name: string) => this.markDirty(name),
      writable: true,
      configurable: true,
      enumerable: false,
    });
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

    pushActiveVM(this);
    try {
      const result = this.executeLoop(module.bytecode, module.constants, scope);
      this.cursor = null;
      return result;
    } finally {
      popActiveVM();
    }
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
        let val = isDynamic === 1 ? evaluateExpression(rawVal, scope, this.declaredVars) : rawVal;

        if (elem) {
          if (attrName === 'style') {
            val = normalizeStyle(val);
          }
          if (attrName in elem && (attrName === 'value' || attrName === 'checked' || attrName === 'selected' || attrName === 'disabled')) {
            (elem as any)[attrName] = val ?? '';
          }
          if (typeof elem.setAttribute === 'function') {
            if (val === true) {
              elem.setAttribute(attrName, '');
            } else if (val === false || val == null || (attrName === 'style' && val === '')) {
              if (typeof elem.removeAttribute === 'function') elem.removeAttribute(attrName);
            } else {
              elem.setAttribute(attrName, String(val));
            }
          }
        }
        break;
      }
      case Opcode.MOUNT_COMPONENT: {
        const dstReg = bytecode[pc + 1]!;
        const compNode = this.getRegister(dstReg);
        const childEntry = compNode ? this.childVMs.get(compNode) : null;
        if (childEntry && childEntry.propsSpec) {
          const { vm: childVM, scope: childScope, propsSpec } = childEntry;
          const newPropsObj = evaluatePropsSpec(propsSpec, scope, this.declaredVars);
          this.updateChildComponentProps(childScope, childVM, newPropsObj);
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

    // 1. Patch INTERPOLATE_TEXT / SET_ATTR / MOUNT_COMPONENT in-place (existing logic)
    if (this.module?.reactiveBindings) {
      const updatedPcs = new Set<number>();
      for (const binding of this.module.reactiveBindings) {
        if (!changedVars.has(binding.variable)) continue;

        for (const pos of binding.positions) {
          if (
            !updatedPcs.has(pos.pc) &&
            (pos.opcode === Opcode.INTERPOLATE_TEXT ||
             pos.opcode === Opcode.SET_ATTR ||
             pos.opcode === Opcode.MOUNT_COMPONENT)
          ) {
            updatedPcs.add(pos.pc);
            this.updateAt(pos.pc, this.module, { scope: this.scope });
          }
        }
      }
    }

    // 2. Re-render reactive @if / @for regions whose deps intersect changedVars in O(1) time
    const candidateRegions = new Set<ReactiveRegion>();
    for (const varName of changedVars) {
      const indexed = this.reactiveRegionsIndex.get(varName);
      if (indexed) {
        for (const region of indexed) {
          candidateRegions.add(region);
        }
      }
    }

    for (const region of candidateRegions) {
      if (this.reactiveRegions.includes(region)) {
        region.reRender();
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
export {
  createContext,
  provide,
  inject,
  provideContext,
  injectContext,
  type Context,
};

