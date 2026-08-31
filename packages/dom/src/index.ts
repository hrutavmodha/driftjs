import type {
  CompiledModule,
  ReactiveBinding,
  DerivedBinding,
  EffectBinding,
  ItemRecord,
  VMExecutionOptions,
  ReactiveRegion,
  RunningEffect,
} from "../types/index.js";
import { Opcode, VMMode } from "../types/index.js";
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
  populateItemScope,
  createContext,
  provide,
  inject,
  provideContext,
  injectContext,
  effect,
  onMount,
  onUnmount,
  type Context,
} from "driftjs-shared";



const NON_BUBBLING_EVENTS = new Set([
  'focus',
  'blur',
  'mouseenter',
  'mouseleave',
  'scroll',
  'load',
  'unload',
  'error',
  'pointerenter',
  'pointerleave',
]);

/**
 * Removes all DOM nodes situated strictly between startAnchor and endAnchor comments.
 */
function clearBetweenAnchors(startAnchor: Node, endAnchor: Node, vm?: DriftClientVM): void {
  const parent = startAnchor.parentNode;
  if (!parent) return;
  let curr = startAnchor.nextSibling;
  while (curr && curr !== endAnchor) {
    const next = curr ? curr.nextSibling : null;
    if (curr && curr.parentNode === parent) {
      if (vm) {
        vm.unmountSubtree(curr);
      }
      parent.removeChild(curr);
    }
    curr = next;
  }
}

/**
 * Register-based Virtual Machine for executing compiled DriftJS templates.
 */
export class DriftClientVM {
  private static readonly MAX_REGISTERS = 256;
  public static activeVMCount = 0;
  private static globalDelegatedListeners = new Map<Document, Map<string, { listener: (e: Event) => void; useCapture: boolean }>>();

  private readonly registers: (Node | any)[] = new Array(DriftClientVM.MAX_REGISTERS);
  public scope: Record<string, any> = {};
  private module: CompiledModule | null = null;
  private mode: VMMode = VMMode.MOUNT;
  private declaredVars: Set<string> = new Set();
  private reactiveBindingsMap = new Map<string, readonly number[]>();
  private updatedPcs = new Set<number>();
  private regionCollectorStack: ReactiveRegion[][] = [];
  private doc: Document | null = null;
  private reactiveRegions = new Set<ReactiveRegion>();
  private reactiveRegionsIndex = new Map<string, Set<ReactiveRegion>>();
  private nodeToRegions = new Map<Node, Set<ReactiveRegion>>();
  private delegatedEvents = new Set<string>();
  private static eventHandlersMap = new WeakMap<Node, Record<string, (e: Event) => void>>();
  private cursor: HydrationCursor | null = null;
  private childVMs = new WeakMap<Node, { vm: DriftClientVM; scope: Record<string, any>; propsSpec: any; nodes?: Node[]; childrenVM?: DriftClientVM | null }>();
  private mountedChildVMs = new Set<DriftClientVM>();
  private pendingDirtyVars = new Set<string>();
  private isUpdateScheduled = false;
  private isUnmounted = false;
  private static readonly MAX_FLUSH_ITERATIONS = 100;
  private static dynamicPcsCache = new WeakMap<CompiledModule, number[]>();
  private depToDerived = new Map<string, DerivedBinding[]>();
  private derivedCache = new Map<string, { val: any; isDirty: boolean; exprConst: any }>();
  private effects: RunningEffect[] = [];
  private depToEffects = new Map<string, RunningEffect[]>();
  private pendingEffects = new Set<RunningEffect>();
  private isRunningEffects = false;

  public parentVM: DriftClientVM | null = null;
  public contextMap = new Map<symbol | string, any>();
  public unmountCallbacks: (() => void)[] = [];

  constructor() {
    DriftClientVM.activeVMCount++;
  }

  public registerProgrammaticEffect(fn: () => void | (() => void) | Promise<any>, isMountOnly: boolean = false): void {
    const runningEff: RunningEffect = {
      deps: [],
      rawFn: fn,
      isDirty: true,
      isMountOnly,
    };
    this.effects.push(runningEff);
    this.pendingEffects.add(runningEff);
  }

  public applyDOMAttribute(
    elem: Node | null,
    attrName: string,
    val: any,
    _scope: Record<string, any>,
  ): void {
    if (!elem) return;

    if (attrName.startsWith('on')) {
      const eventName = attrName.slice(2).toLowerCase();
      if (typeof val === 'function') {
        let handlers = DriftClientVM.eventHandlersMap.get(elem);
        if (!handlers) {
          handlers = {};
          DriftClientVM.eventHandlersMap.set(elem, handlers);
        }

        const existingHandler = handlers[eventName];
        if (existingHandler && (existingHandler as any)._fn) {
          (existingHandler as any)._fn = val;
          (existingHandler as any)._vm = this;
        } else {
          const vm = this;
          const wrappedHandler = function (this: any, ...args: any[]) {
            const targetVM = (wrappedHandler as any)._vm || vm;
            const currentFn = (wrappedHandler as any)._fn;
            if (typeof currentFn !== 'function') return;
            const scopeSnapshot = new Map<string, any>();
            if (targetVM.declaredVars) {
              for (const key of targetVM.declaredVars) {
                scopeSnapshot.set(key, targetVM.scope[key]);
              }
            }
            const result = currentFn.apply(this, args);
            const changedVars = new Set<string>();
            if (targetVM.declaredVars) {
              for (const key of targetVM.declaredVars) {
                if (targetVM.scope[key] !== scopeSnapshot.get(key)) changedVars.add(key);
              }
            }
            for (const dirtyVar of targetVM.pendingDirtyVars) {
              changedVars.add(dirtyVar);
            }
            if (changedVars.size > 0) {
              targetVM.pendingDirtyVars.clear();
              targetVM.triggerUpdates(changedVars);
            }
            if (targetVM.pendingDirtyVars.size > 0 || targetVM.pendingEffects.size > 0) targetVM.flushUpdates();
            return result;
          };
          (wrappedHandler as any)._fn = val;
          (wrappedHandler as any)._vm = this;
          handlers[eventName] = wrappedHandler;
        }
        this.ensureEventDelegated(eventName);
      } else {
        const handlers = DriftClientVM.eventHandlersMap.get(elem);
        if (handlers && handlers[eventName]) {
          delete handlers[eventName];
        }
        if (typeof (elem as Element).removeAttribute === 'function') {
          if ((elem as Element).hasAttribute(attrName)) {
            (elem as Element).removeAttribute(attrName);
          }
        }
      }
    } else {
      if (attrName === 'style') {
        val = normalizeStyle(val);
      }
      if (attrName in elem && (attrName === 'value' || attrName === 'checked' || attrName === 'selected' || attrName === 'disabled')) {
        const targetVal = val ?? '';
        if ((elem as any)[attrName] !== targetVal) {
          (elem as any)[attrName] = targetVal;
        }
      }
      if (typeof (elem as Element).setAttribute === 'function') {
        const isAriaOrData = attrName.startsWith('aria-') || attrName.startsWith('data-');
        if (val === true) {
          const target = isAriaOrData ? 'true' : '';
          if ((elem as Element).getAttribute(attrName) !== target) {
            (elem as Element).setAttribute(attrName, target);
          }
        } else if (val === false) {
          if (isAriaOrData) {
            if ((elem as Element).getAttribute(attrName) !== 'false') {
              (elem as Element).setAttribute(attrName, 'false');
            }
          } else if (typeof (elem as Element).removeAttribute === 'function') {
            if ((elem as Element).hasAttribute(attrName)) {
              (elem as Element).removeAttribute(attrName);
            }
          }
        } else if (val == null || (attrName === 'style' && val === '')) {
          if (typeof (elem as Element).removeAttribute === 'function') {
            if ((elem as Element).hasAttribute(attrName)) {
              (elem as Element).removeAttribute(attrName);
            }
          }
        } else {
          const strVal = String(val);
          if ((elem as Element).getAttribute(attrName) !== strVal) {
            (elem as Element).setAttribute(attrName, strVal);
          }
        }
      }
    }
  }

  private addNodeRegion(node: Node, region: ReactiveRegion): void {
    let set = this.nodeToRegions.get(node);
    if (!set) {
      set = new Set<ReactiveRegion>();
      this.nodeToRegions.set(node, set);
    }
    set.add(region);
  }

  private removeNodeRegion(node: Node, region: ReactiveRegion): void {
    const set = this.nodeToRegions.get(node);
    if (set) {
      set.delete(region);
      if (set.size === 0) this.nodeToRegions.delete(node);
    }
  }

  public unmountSubtree(node: Node | null): void {
    if (!node) return;
    const entry = this.childVMs.get(node);

    if (entry) {
      if (this.mountedChildVMs.has(entry.vm)) {
        this.mountedChildVMs.delete(entry.vm);
        entry.vm.unmount();
      }
      if (entry.nodes) {
        for (const n of entry.nodes) {
          this.childVMs.delete(n);
        }
      } else {
        this.childVMs.delete(node);
      }
    }

    const directRegions = this.nodeToRegions.get(node);
    if (directRegions) {
      for (const region of Array.from(directRegions)) {
        this.removeRegion(region);
      }
    }

    const children = (node as any).childNodes;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child) {
          this.unmountSubtree(child);
        }
      }
    }
  }

  public registerRegion(region: ReactiveRegion): void {
    this.reactiveRegions.add(region);
    for (const dep of region.deps) {
      let set = this.reactiveRegionsIndex.get(dep);
      if (!set) {
        set = new Set<ReactiveRegion>();
        this.reactiveRegionsIndex.set(dep, set);
      }
      set.add(region);
    }
    if (region.startAnchor) this.addNodeRegion(region.startAnchor, region);
    if (region.endAnchor) this.addNodeRegion(region.endAnchor, region);
    if (region.parentNode) this.addNodeRegion(region.parentNode, region);

    if (this.regionCollectorStack.length > 0) {
      this.regionCollectorStack[this.regionCollectorStack.length - 1]!.push(region);
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

    if (region.startAnchor) this.removeNodeRegion(region.startAnchor, region);
    if (region.endAnchor) this.removeNodeRegion(region.endAnchor, region);
    if (region.parentNode) this.removeNodeRegion(region.parentNode, region);

    this.reactiveRegions.delete(region);
  }

  public unmount(): void {
    if (this.isUnmounted) return;
    this.isUnmounted = true;

    if (DriftClientVM.activeVMCount > 0) {
      DriftClientVM.activeVMCount--;
    }


    for (const childVM of Array.from(this.mountedChildVMs)) {
      childVM.unmount();
    }
    this.mountedChildVMs.clear();

    for (const region of Array.from(this.reactiveRegions)) {
      this.removeRegion(region);
    }
    this.reactiveRegions.clear();
    this.reactiveRegionsIndex.clear();

    if (DriftClientVM.activeVMCount === 0 && DriftClientVM.globalDelegatedListeners.size > 0) {
      for (const [docRoot, listenersMap] of DriftClientVM.globalDelegatedListeners.entries()) {
        for (const [eventName, { listener, useCapture }] of listenersMap.entries()) {
          docRoot.removeEventListener(eventName, listener, useCapture);
        }
      }
      DriftClientVM.globalDelegatedListeners.clear();
    }

    this.clearEffects();

    if (this.unmountCallbacks && this.unmountCallbacks.length > 0) {
      for (const cb of this.unmountCallbacks) {
        try {
          cb();
        } catch (e) {
          console.error(e);
        }
      }
      this.unmountCallbacks = [];
    }

    this.registers.fill(null);
    this.pendingDirtyVars.clear();
    this.depToDerived.clear();
    this.derivedCache.clear();
    this.isUpdateScheduled = false;
    this.scope = {};
    this.module = null;
    this.contextMap.clear();
    this.parentVM = null;
  }

  private clearEffects(): void {
    for (const eff of this.effects) {
      if (typeof eff.cleanup === 'function') {
        try {
          eff.cleanup();
        } catch (err) {
          console.error('[DriftJS] Error executing effect cleanup:', err);
        }
        eff.cleanup = undefined;
      }
    }
    this.effects = [];
    this.depToEffects.clear();
    this.pendingEffects.clear();
  }

  public markDirty(varName: string): void {
    if (!this.module) return;
    this.pendingDirtyVars.add(varName);
    this.invalidateDerived(varName);
    this.invalidateEffects(varName);
    if (!this.isUpdateScheduled) {
      this.isUpdateScheduled = true;
      queueMicrotask(() => this.flushUpdates());
    }
  }

  private invalidateDerived(varName: string, visited: Set<string> = new Set()): void {
    if (visited.has(varName)) return;
    visited.add(varName);

    const derivedList = this.depToDerived.get(varName);
    if (derivedList && derivedList.length > 0) {
      for (const d of derivedList) {
        const cache = this.derivedCache.get(d.name);
        if (cache) {
          cache.isDirty = true;
        }
        this.pendingDirtyVars.add(d.name);
        this.invalidateEffects(d.name);
        this.invalidateDerived(d.name, visited);
      }
    }
  }

  private invalidateEffects(varName: string): void {
    const effectList = this.depToEffects.get(varName);
    if (effectList && effectList.length > 0) {
      for (const eff of effectList) {
        if (!eff.isMountOnly) {
          eff.isDirty = true;
          this.pendingEffects.add(eff);
        }
      }
    }
  }

  private flushUpdates(): void {
    this.isUpdateScheduled = false;
    if (!this.module || (this.pendingDirtyVars.size === 0 && this.pendingEffects.size === 0)) return;

    let iterations = 0;
    while (this.pendingDirtyVars.size > 0 || this.pendingEffects.size > 0) {
      if (iterations >= DriftClientVM.MAX_FLUSH_ITERATIONS) {
        this.pendingDirtyVars.clear();
        this.pendingEffects.clear();
        console.error(
          `DriftClientVM: Maximum recursive update limit (${DriftClientVM.MAX_FLUSH_ITERATIONS}) exceeded. Possible infinite reactivity loop detected.`
        );
        break;
      }
      iterations++;
      if (this.pendingDirtyVars.size > 0) {
        const dirty = new Set(this.pendingDirtyVars);
        this.pendingDirtyVars.clear();
        this.triggerUpdates(dirty);
      }
      if (this.pendingEffects.size > 0) {
        this.flushPendingEffects();
      }
    }
  }

  public flushPendingEffects(): void {
    if (this.isRunningEffects || this.pendingEffects.size === 0 || this.isUnmounted) return;
    this.isRunningEffects = true;
    try {
      const effectsToRun = Array.from(this.pendingEffects);
      this.pendingEffects.clear();
      for (const eff of effectsToRun) {
        if (this.isUnmounted) break;
        if (typeof eff.cleanup === 'function') {
          try {
            eff.cleanup();
          } catch (err) {
            console.error('[DriftJS] Error executing effect cleanup:', err);
          }
          eff.cleanup = undefined;
        }

        try {
          let res: any;
          if (eff.rawFn) {
            res = eff.rawFn();
          } else if (eff.exprConst) {
            res = evaluateExpression(eff.exprConst, this.scope, this.declaredVars);
          }
          if (typeof res === 'function') {
            eff.cleanup = res;
          }
        } catch (err) {
          console.error('[DriftJS] Error executing effect callback:', err);
        }
        eff.isDirty = false;
      }
    } finally {
      this.isRunningEffects = false;
    }
  }


  private updateChildComponentProps(childScope: Record<string, any>, childVM: DriftClientVM, newPropsObj: Record<string, any>): void {
    const oldProps = childScope.props || {};
    childScope.props = newPropsObj;

    const dirtyPropVars = new Set<string>();

    for (const key of Object.keys(newPropsObj)) {
      if (key === '__drift_props__' || key === '__proto__' || key === 'constructor' || key === 'prototype' || key === '__drift_mark_dirty__') continue;
      const newVal = newPropsObj[key];
      const oldVal = oldProps[key];
      if (newVal !== oldVal) {
        childScope[key] = newVal;
        dirtyPropVars.add(key);
      }
    }

    for (const key of Object.keys(oldProps)) {
      if (key === '__drift_props__' || key === '__proto__' || key === 'constructor' || key === 'prototype' || key === '__drift_mark_dirty__') continue;
      if (!Object.prototype.hasOwnProperty.call(newPropsObj, key)) {
        childScope[key] = undefined;
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

    let docListeners = DriftClientVM.globalDelegatedListeners.get(root);
    if (!docListeners) {
      docListeners = new Map();
      DriftClientVM.globalDelegatedListeners.set(root, docListeners);
    }

    if (!docListeners.has(eventName)) {
      const listener = (e: Event) => {
        let curr = e.target as Node | null;
        while (curr && curr !== root) {
          if (curr.nodeType === 1) {
            const handlers = DriftClientVM.eventHandlersMap.get(curr);
            if (handlers && handlers[eventName]) {
              handlers[eventName].call(curr, e);
              if (e.cancelBubble || (NON_BUBBLING_EVENTS.has(eventName) && !e.bubbles)) {
                break;
              }
            }
          }
          curr = curr.parentNode;
        }
      };
      const useCapture = NON_BUBBLING_EVENTS.has(eventName);
      root.addEventListener(eventName, listener, useCapture);
      docListeners.set(eventName, { listener, useCapture });
    }
  }

  private checkRegister(index: number): void {
    if (index < 0 || index >= DriftClientVM.MAX_REGISTERS) {
      throw new Error(`Register index ${index} out of bounds (0-${DriftClientVM.MAX_REGISTERS - 1})`);
    }
  }

  private setRegister(index: number, value: any, registers: (Node | any)[] = this.registers): void {
    this.checkRegister(index);
    registers[index] = value;
  }

  private getRegister(index: number, registers: (Node | any)[] = this.registers): any {
    this.checkRegister(index);
    return registers[index];
  }

  /**
   * Runs the bytecode of a sub-module using a dedicated register window without copying parent registers.
   * Directly returns the created DOM fragment, the exact child reactive regions, and the instantiated registers.
   */
  private runSubModule(
    rawSubMod: { bytecode: readonly number[] | Uint32Array; constants: readonly any[] },
    scope: Record<string, any>
  ): { fragment: DocumentFragment | null; createdRegions: ReactiveRegion[]; registers: (Node | any)[] } {
    const subMod = (resolveComponentModule(rawSubMod) || rawSubMod) as CompiledModule;
    const savedModule = this.module;
    const savedDeclaredVars = this.declaredVars;

    this.module = subMod;
    if (subMod.declaredVars && subMod.declaredVars.length > 0) {
      this.declaredVars = new Set(subMod.declaredVars);
    }

    const createdRegions: ReactiveRegion[] = [];
    this.regionCollectorStack.push(createdRegions);

    const subRegisters = new Array(DriftClientVM.MAX_REGISTERS);
    const fragment = this.executeFrom(0, subMod.bytecode, subMod.constants, scope, VMMode.MOUNT, subRegisters) as DocumentFragment | null;

    this.regionCollectorStack.pop();
    this.module = savedModule;
    this.declaredVars = savedDeclaredVars;
    return { fragment, createdRegions, registers: subRegisters };
  }

  private getDynamicPcs(mod: CompiledModule): number[] {
    let pcs = DriftClientVM.dynamicPcsCache.get(mod);
    if (pcs) return pcs;

    pcs = [];
    const bytecode = mod.bytecode;
    for (let pc = 0; pc < bytecode.length; ) {
      const opcode = bytecode[pc]!;
      switch (opcode) {
        case Opcode.SET_ATTR: {
          const isDynamic = bytecode[pc + 4]!;
          if (isDynamic === 1) {
            pcs.push(pc);
          }
          pc += 5;
          break;
        }
        case Opcode.INTERPOLATE_TEXT: {
          pcs.push(pc);
          pc += 3;
          break;
        }
        case Opcode.MOUNT_COMPONENT: {
          pcs.push(pc);
          pc += 4;
          break;
        }
        case Opcode.CREATE_ELEMENT:
        case Opcode.CREATE_TEXT:
        case Opcode.CREATE_COMMENT:
        case Opcode.APPEND_CHILD:
          pc += 3;
          break;
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
        case Opcode.RETURN:
          pc += 1;
          break;
        default:
          pc = bytecode.length;
          break;
      }
    }

    DriftClientVM.dynamicPcsCache.set(mod, pcs);
    return pcs;
  }

  /**
   * Fast-path in-place update for reactive list items with persistent register frames.
   * Jumps directly to dynamic instruction PCs in VMMode.UPDATE on the row's register array.
   */
  public updateRowRegisters(
    bodyMod: CompiledModule,
    childScope: Record<string, any>,
    registers: (Node | any)[],
    childRegions?: ReactiveRegion[]
  ): void {
    const dynamicPcs = this.getDynamicPcs(bodyMod);
    for (let i = 0; i < dynamicPcs.length; i++) {
      const pc = dynamicPcs[i]!;
      this.executeFrom(pc, bodyMod.bytecode, bodyMod.constants, childScope, VMMode.UPDATE, registers);
    }
    if (childRegions && childRegions.length > 0) {
      for (let i = 0; i < childRegions.length; i++) {
        const region = childRegions[i];
        if (region && typeof region.reRender === 'function') {
          region.reRender();
        }
      }
    }
  }

  /**
   * Core execution loop — shared between initial mount (MOUNT mode) and reactive slice execution (UPDATE mode).
   */
  private executeFrom(
    startPc: number,
    bytecode: readonly number[] | Uint32Array,
    constants: readonly any[],
    scope: Record<string, any>,
    mode: VMMode,
    registers: (Node | any)[] = this.registers
  ): Node | null {
    const doc = this.doc!;
    const prevMode = this.mode;
    this.mode = mode;
    let pc = startPc;

    try {
      while (pc < bytecode.length) {
        const opcode = bytecode[pc]!;

        switch (opcode) {
          case Opcode.RETURN: {
            if (this.mode === VMMode.UPDATE) {
              return null;
            }
            pc += 1;
            break;
          }

          case Opcode.CREATE_ELEMENT: {
            if (this.mode === VMMode.MOUNT) {
              const dstReg = bytecode[pc + 1]!;
              const tagConstIdx = bytecode[pc + 2]!;
              const tag = String(constants[tagConstIdx]);
              const elem = this.cursor ? this.cursor.claimElement(tag, doc) : doc.createElement(tag);
              this.setRegister(dstReg, elem, registers);
            }
            pc += 3;
            break;
          }

          case Opcode.MOUNT_COMPONENT: {
            const dstReg = bytecode[pc + 1]!;
            const tagConstIdx = bytecode[pc + 2]!;
            const propsSpecIdx = bytecode[pc + 3]!;

            if (this.mode === VMMode.MOUNT) {
              const tag = String(constants[tagConstIdx]);
              const rawComp = (scope && tag in scope) ? scope[tag] : (typeof globalThis !== 'undefined' && (globalThis as any)[tag]);
              const compMod = resolveComponentModule(rawComp);
              if (compMod) {
                const propsSpec = propsSpecIdx !== 0xFF ? constants[propsSpecIdx] : null;
                const propsObj = evaluatePropsSpec(propsSpec, scope, this.declaredVars);

                let childrenNode: Node | undefined = undefined;
                let childrenVM: DriftClientVM | null = null;
                if (propsSpec && propsSpec.__drift_children__ !== undefined) {
                  const childrenSubMod = constants[propsSpec.__drift_children__] ?? propsSpec.__drift_children__;
                  if (childrenSubMod) {
                    childrenVM = new DriftClientVM();
                    childrenVM.parentVM = this;
                    childrenNode = childrenVM.execute(childrenSubMod, { scope, document: doc, cursor: this.cursor }) as Node | undefined;
                  }
                }

                const childVM = new DriftClientVM();
                childVM.parentVM = this;
                const childScope = Object.assign(Object.create(scope), { props: propsObj }, propsObj);
                if (childrenNode !== undefined) {
                  childScope.children = childrenNode;
                }
                const compNode = childVM.execute(compMod, { scope: childScope, document: doc, cursor: this.cursor });
                if (compNode) {
                  const childEntry = { vm: childVM, scope: childVM.scope, propsSpec, nodes: [] as Node[], childrenVM };
                  this.childVMs.set(compNode, childEntry);
                  childEntry.nodes.push(compNode);
                  if (compNode.nodeType === 11) {
                    for (let i = 0; i < compNode.childNodes.length; i++) {
                      const childNode = compNode.childNodes[i]!;
                      this.childVMs.set(childNode, childEntry);
                      childEntry.nodes.push(childNode);
                    }
                  }
                  this.mountedChildVMs.add(childVM);
                  if (childrenVM) this.mountedChildVMs.add(childrenVM);
                  this.setRegister(dstReg, compNode, registers);
                }
              }
            } else {
              const compNode = this.getRegister(dstReg, registers);
              const childEntry = compNode ? this.childVMs.get(compNode) : null;
              if (childEntry) {
                if (childEntry.propsSpec) {
                  const { vm: childVM, scope: childScope, propsSpec } = childEntry;
                  const newPropsObj = evaluatePropsSpec(propsSpec, scope, this.declaredVars);
                  this.updateChildComponentProps(childVM.scope, childVM, newPropsObj);
                }
                if (childEntry.childrenVM) {
                  childEntry.childrenVM.triggerUpdates(new Set(this.declaredVars));
                }
              }
            }
            pc += 4;
            break;
          }

          case Opcode.CREATE_TEXT: {
            if (this.mode === VMMode.MOUNT) {
              const dstReg = bytecode[pc + 1]!;
              const text = constants[bytecode[pc + 2]!];
              const val = evaluateExpression(text, scope, this.declaredVars);
              const textNode = this.cursor ? this.cursor.claimText(doc) : doc.createTextNode(val != null ? String(val) : '');
              this.setRegister(dstReg, textNode, registers);
            }
            pc += 3;
            break;
          }

          case Opcode.CREATE_COMMENT: {
            if (this.mode === VMMode.MOUNT) {
              const dstReg = bytecode[pc + 1]!;
              const comment = String(constants[bytecode[pc + 2]!] ?? '');
              const commentNode = this.cursor ? this.cursor.claimComment(comment, doc) : doc.createComment(comment);
              this.setRegister(dstReg, commentNode, registers);
            }
            pc += 3;
            break;
          }

          case Opcode.CREATE_FRAGMENT: {
            if (this.mode === VMMode.MOUNT) {
              const dstReg = bytecode[pc + 1]!;
              this.setRegister(dstReg, doc.createDocumentFragment(), registers);
            }
            pc += 2;
            break;
          }

          case Opcode.APPEND_CHILD: {
            if (this.mode === VMMode.MOUNT) {
              const parent = this.getRegister(bytecode[pc + 1]!, registers);
              const child = this.getRegister(bytecode[pc + 2]!, registers);
              if (parent && child && typeof parent.appendChild === 'function') {
                if (!this.cursor || (child.parentNode !== parent && parent.nodeType !== 11)) {
                  parent.appendChild(child);
                }
              }
            }
            pc += 3;
            break;
          }

          case Opcode.SET_ATTR: {
            const elem = this.getRegister(bytecode[pc + 1]!, registers);
            const attrName = String(constants[bytecode[pc + 2]!]);
            const rawVal = constants[bytecode[pc + 3]!];
            const isDynamic = bytecode[pc + 4]!;

            if (this.mode === VMMode.MOUNT || isDynamic === 1) {
              const val = isDynamic === 1 ? evaluateExpression(rawVal, scope, this.declaredVars) : rawVal;
              this.applyDOMAttribute(elem, attrName, val, scope);
            }
            pc += 5;
            break;
          }

          case Opcode.INTERPOLATE_TEXT: {
            const dstReg = bytecode[pc + 1]!;
            const expr = constants[bytecode[pc + 2]!];
            const val = evaluateExpression(expr, scope, this.declaredVars);

            if (this.mode === VMMode.MOUNT) {
              if (val && typeof val === 'object' && ('nodeType' in val)) {
                this.setRegister(dstReg, val, registers);
              } else {
                const textNode = this.cursor ? this.cursor.claimText(doc) : doc.createTextNode(val != null ? String(val) : '');
                textNode.nodeValue = val != null ? String(val) : '';
                this.setRegister(dstReg, textNode, registers);
              }
            } else {
              const existingNode = this.getRegister(dstReg, registers);
              if (existingNode && existingNode.nodeType === 3) {
                existingNode.nodeValue = val != null ? String(val) : '';
              }
            }
            pc += 3;
            break;
          }

          case Opcode.EXEC_SCRIPT: {
            if (this.mode === VMMode.MOUNT) {
              const scriptBody = constants[bytecode[pc + 1]!];
              if (Array.isArray(scriptBody)) {
                for (const stmt of scriptBody) {
                  evaluateExpression(stmt, scope, this.declaredVars);
                }
              } else if (scriptBody) {
                evaluateExpression(scriptBody, scope, this.declaredVars);
              }
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

            const parentElem = this.getRegister(parentReg, registers);
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
            let childRegions: ReactiveRegion[] = [];
            let ifRegion: ReactiveRegion | null = null;

            const renderIf = () => {
              for (const r of childRegions) {
                vm.removeRegion(r);
              }
              childRegions = [];
              if (actualEndAnchor && startAnchor.parentNode) {
                clearBetweenAnchors(startAnchor, actualEndAnchor, vm);
              }
              const cond = evaluateExpression(condExpr, scope, vm.declaredVars);
              const subMod = cond ? consMod : altMod;
              if (subMod) {
                const { fragment, createdRegions } = vm.runSubModule(subMod, scope);
                childRegions = createdRegions;
                if (fragment) {
                  if (actualEndAnchor && actualEndAnchor.parentNode) {
                    actualEndAnchor.parentNode.insertBefore(fragment, actualEndAnchor);
                  } else {
                    parentElem.appendChild(fragment);
                  }
                }
              }
              if (ifRegion) {
                ifRegion.childRegions = childRegions;
              }
            };
            renderIf();

            if (this.cursor) {
              actualEndAnchor = this.cursor.claimComment('/if', doc);
              if (!actualEndAnchor.parentNode || actualEndAnchor.parentNode !== parentElem) {
                parentElem.appendChild(actualEndAnchor);
              }
            }

            ifRegion = {
              deps,
              reRender: () => {
                renderIf();
              },
              childRegions,
              parentNode: parentElem,
              startAnchor,
              endAnchor: actualEndAnchor,
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

            const parentElem  = this.getRegister(parentReg, registers);
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
              if (record.nodes) {
                for (const node of record.nodes) {
                  vm.unmountSubtree(node);
                }
              }
              if (record.registers) {
                record.registers.fill(null);
                record.registers = undefined;
              }
            };

            const renderFor = () => {
              const rawIter = evaluateExpression(iterExpr, scope, vm.declaredVars);
              const items = resolveIterable(rawIter);

              reconcileKeyedList(
                (actualEndAnchor && actualEndAnchor.parentNode) || parentElem,
                actualEndAnchor,
                forCacheRef,
                items,
                (itemVal, indexVal) => {
                  if (keyExpr) {
                    const itemScope = Object.create(scope);
                    populateItemScope(itemScope, itemName, itemVal, indexName, indexVal);
                    return evaluateExpression(keyExpr, itemScope, vm.declaredVars);
                  }
                  return indexVal;
                },
                (itemVal, indexVal, refNode) => {
                  const childScope = Object.create(scope);
                  populateItemScope(childScope, itemName, itemVal, indexName, indexVal);

                  const { fragment: frag, createdRegions: childRegions, registers: rowRegisters } = vm.runSubModule(bodyMod, childScope);
                  const nodes: Node[] = frag
                    ? frag.nodeType === 11
                      ? Array.from(frag.childNodes)
                      : [frag]
                    : [];

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
                    registers: rowRegisters,
                    scope: childScope,
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

                  const childScope = record.scope || Object.create(scope);
                  populateItemScope(childScope, itemName, itemVal, indexName, indexVal);
                  record.scope = childScope;

                  const equal = itemsEqual(record.itemVal, itemVal) && (!indexName || record.indexVal === indexVal);
                  record.itemVal = itemVal;
                  record.indexVal = indexVal;

                  if (record.registers && record.nodes.length > 0) {
                    vm.updateRowRegisters(bodyMod, childScope, record.registers, equal ? undefined : record.childRegions);
                    return;
                  }

                  if (equal) {
                    return;
                  }

                  if (record.childRegions) {
                    for (const r of record.childRegions) {
                      vm.removeRegion(r);
                    }
                  }

                  const { fragment: frag, createdRegions, registers: newRegisters } = vm.runSubModule(bodyMod, childScope);
                  record.childRegions = createdRegions;
                  record.registers = newRegisters;

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
                      const newHandlers = DriftClientVM.eventHandlersMap.get(newElem);
                      if (newHandlers) {
                        DriftClientVM.eventHandlersMap.set(elem, newHandlers);
                      } else {
                        DriftClientVM.eventHandlersMap.delete(elem);
                      }
                      for (const attr of Array.from(elem.attributes)) {
                        elem.removeAttribute(attr.name);
                      }
                      for (const attr of Array.from(newElem.attributes)) {
                        elem.setAttribute(attr.name, attr.value);
                      }
                      while (elem.firstChild) {
                        vm.unmountSubtree(elem.firstChild);
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
                          vm.unmountSubtree(oldNode);
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
              parentNode: parentElem,
              startAnchor,
              endAnchor: actualEndAnchor,
            };
            this.registerRegion(forRegion);

            pc += 8;
            break;
          }

          default:
            throw new Error(`Unknown Opcode ${opcode} at PC ${pc}`);
        }
      }

      return this.mode === VMMode.MOUNT ? (this.getRegister(0, registers) as Node | null) : null;
    } finally {
      this.mode = prevMode;
    }
  }

  public execute(rawModule: CompiledModule, options: VMExecutionOptions = {}): Node | null {
    const module = (resolveComponentModule(rawModule) || rawModule) as CompiledModule;
    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      throw new Error('DriftClientVM requires a DOM Document context to execute.');
    }

    this.doc = doc;
    this.reactiveRegions.clear();
    this.reactiveRegionsIndex.clear();
    this.nodeToRegions.clear();

    if (options.cursor) {
      this.cursor = options.cursor;
    } else if (options.hydrate && options.container) {
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
      writable: false,
      configurable: false,
      enumerable: false,
    });

    this.scope = scope;
    this.module = module;
    this.declaredVars = new Set(module.declaredVars ?? []);

    this.reactiveBindingsMap.clear();
    if (module.reactiveBindings) {
      for (const b of module.reactiveBindings) {
        this.reactiveBindingsMap.set(b.variable, b.positions);
      }
    }

    this.depToDerived.clear();
    this.derivedCache.clear();
    this.clearEffects();

    if (module.effects && module.effects.length > 0) {
      for (const e of module.effects) {
        const runningEff: RunningEffect = {
          deps: e.deps,
          exprConst: module.constants[e.exprIdx],
          isDirty: true,
        };
        this.effects.push(runningEff);
        this.pendingEffects.add(runningEff);
        for (const dep of e.deps) {
          if (!this.depToEffects.has(dep)) {
            this.depToEffects.set(dep, []);
          }
          this.depToEffects.get(dep)!.push(runningEff);
        }
      }
    }

    if (module.derived && module.derived.length > 0) {
      for (const d of module.derived) {
        for (const dep of d.deps) {
          if (!this.depToDerived.has(dep)) {
            this.depToDerived.set(dep, []);
          }
          this.depToDerived.get(dep)!.push(d);
        }

        const exprConst = module.constants[d.exprIdx];
        const cacheEntry = {
          val: undefined,
          isDirty: true,
          exprConst,
        };
        this.derivedCache.set(d.name, cacheEntry);

        Object.defineProperty(scope, d.name, {
          get: () => {
            if (cacheEntry.isDirty) {
              cacheEntry.val = evaluateExpression(cacheEntry.exprConst, scope, this.declaredVars);
              cacheEntry.isDirty = false;
            }
            return cacheEntry.val;
          },
          enumerable: true,
          configurable: true,
        });
      }
    }

    this.registers.fill(undefined);

    pushActiveVM(this);
    try {
      const result = this.executeFrom(0, module.bytecode, module.constants, scope, VMMode.MOUNT);
      this.cursor = null;
      this.flushPendingEffects();
      return result;
    } finally {
      popActiveVM();
    }
  }

  /**
   * Re-evaluates reactive bindings whose variables are in `changedVars`, updating the DOM in-place.
   * Also triggers re-render of reactive @if / @for regions whose deps intersect changedVars.
   */
  public triggerUpdates(changedVars: Set<string>): void {
    if (changedVars.size === 0) return;

    for (const varName of changedVars) {
      this.invalidateEffects(varName);
    }

    if (this.reactiveBindingsMap.size > 0 && this.module) {
      this.updatedPcs.clear();
      for (const varName of changedVars) {
        const positions = this.reactiveBindingsMap.get(varName);
        if (!positions) continue;

        for (const pc of positions) {
          if (!this.updatedPcs.has(pc)) {
            this.updatedPcs.add(pc);
            this.executeFrom(pc, this.module.bytecode, this.module.constants, this.scope, VMMode.UPDATE);
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
      if (this.reactiveRegions.has(region)) {
        region.reRender();
      }
    }
  }
}

/**
 * Mounts a compiled Drift component into an HTMLElement container.
 */
export function mount(component: CompiledModule, container: HTMLElement, options: VMExecutionOptions = {}): DriftClientVM {
  const vm = new DriftClientVM();
  const node = vm.execute(component, options);
  if (node != null) {
    container.appendChild(node);
  }
  return vm;
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
export * from "./selective.js";
export { HydrationCursor } from "./hydration.js";
export {
  createContext,
  provide,
  inject,
  provideContext,
  injectContext,
  effect,
  onMount,
  onUnmount,
  type Context,
};

