import { resolveIterable } from './evaluator.js';
import { splitPatternEntries, findTopLevelChar } from './scanner.js';

/**
 * Sets a variable in scope, updating parent scope if it exists higher in prototype chain.
 */
export function setScopeValue<T = any>(targetScope: Record<string, any>, name: string, val: T): T {
  if (!targetScope || typeof targetScope !== 'object') return val;
  if (name === '__proto__' || name === 'constructor' || name === 'prototype' || name === '__drift_mark_dirty__') {
    return val;
  }

  let curr: any = targetScope;
  let setOn: any = null;
  const dirtyFns: ((name: string) => void)[] = [];

  // Single upward pass: find owner and collect dirty functions simultaneously
  while (curr && curr !== Object.prototype) {
    if (typeof curr.__drift_mark_dirty__ === 'function') {
      dirtyFns.push(curr.__drift_mark_dirty__);
    }
    if (Object.prototype.hasOwnProperty.call(curr, name)) {
      curr[name] = val;
      setOn = curr;
      break;
    }
    curr = Object.getPrototypeOf(curr);
  }

  if (!setOn) {
    targetScope[name] = val;
  }

  // Trigger dirty marking on all affected scope VMs (skip internal __drift_ variables)
  if (!name.startsWith('__drift_')) {
    for (let i = 0; i < dirtyFns.length; i++) {
      try {
        dirtyFns[i]!(name);
      } catch (err) {
        console.error(`[DriftJS] Error notifying dirty update for "${name}":`, err);
      }
    }
  }

  return val;
}

/**
 * Safely checks if a property exists on scope or any of its parent scopes,
 * stopping before Object.prototype to prevent prototype pollution / scope hijacking.
 */
export function inScopeChain(scope: any, name: string): boolean {
  if (!scope || typeof scope !== 'object') return false;
  let curr: any = scope;
  while (curr && curr !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(curr, name)) {
      return true;
    }
    curr = Object.getPrototypeOf(curr);
  }
  return false;
}

/**
 * Safely gets a variable value from the scope chain, or falls back to globalThis in a single traversal.
 */
export function getScopeValue(scope: any, name: string): any {
  if (name === '__proto__' || name === 'constructor' || name === 'prototype' || name === '__drift_mark_dirty__') {
    return undefined;
  }

  // Single pass on scope chain
  if (scope && typeof scope === 'object') {
    let curr: any = scope;
    while (curr && curr !== Object.prototype) {
      if (Object.prototype.hasOwnProperty.call(curr, name)) {
        return curr[name];
      }
      curr = Object.getPrototypeOf(curr);
    }
  }

  // Fallback: single pass on globalThis
  if (typeof globalThis !== 'undefined' && globalThis) {
    let curr: any = globalThis;
    while (curr && curr !== Object.prototype) {
      if (Object.prototype.hasOwnProperty.call(curr, name)) {
        return (globalThis as any)[name];
      }
      curr = Object.getPrototypeOf(curr);
    }
  }

  return undefined;
}

function safeSetScopeProp(scope: Record<string, any>, key: string, val: any): void {
  if (!scope || typeof scope !== 'object') return;
  if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key === '__drift_mark_dirty__') {
    return;
  }
  scope[key] = val;
}

/**
 * Populates scope for @for loop items, supporting object and array destructuring patterns with aliasing and defaults.
 */
export function populateItemScope(
  scope: Record<string, any>,
  itemName: string,
  itemVal: any,
  indexName: string | null,
  indexVal: number
): void {
  safeSetScopeProp(scope, itemName, itemVal);
  if (indexName) safeSetScopeProp(scope, indexName, indexVal);

  if (itemName.startsWith('{') && itemName.endsWith('}')) {
    const safeObj = itemVal && typeof itemVal === 'object' ? itemVal : {};
    const entries = splitPatternEntries(itemName.slice(1, -1));
    for (const entry of entries) {
      const colonIdx = findTopLevelChar(entry, ':');
      if (colonIdx !== -1) {
        const propName = entry.slice(0, colonIdx).trim();
        const target = entry.slice(colonIdx + 1).trim();
        const eqIdx = findTopLevelChar(target, '=');
        if (eqIdx !== -1) {
          const varName = target.slice(0, eqIdx).trim();
          const defValStr = target.slice(eqIdx + 1).trim();
          const val = Object.prototype.hasOwnProperty.call(safeObj, propName) ? (safeObj as any)[propName] : undefined;
          safeSetScopeProp(scope, varName, val !== undefined ? val : parseDefaultValue(defValStr, scope));
        } else if (target.startsWith('{') || target.startsWith('[')) {
          const val = Object.prototype.hasOwnProperty.call(safeObj, propName) ? (safeObj as any)[propName] : undefined;
          populateItemScope(scope, target, val, null, 0);
        } else {
          const val = Object.prototype.hasOwnProperty.call(safeObj, propName) ? (safeObj as any)[propName] : undefined;
          safeSetScopeProp(scope, target, val);
        }
      } else {
        const eqIdx = findTopLevelChar(entry, '=');
        if (eqIdx !== -1) {
          const propName = entry.slice(0, eqIdx).trim();
          const defValStr = entry.slice(eqIdx + 1).trim();
          const val = Object.prototype.hasOwnProperty.call(safeObj, propName) ? (safeObj as any)[propName] : undefined;
          safeSetScopeProp(scope, propName, val !== undefined ? val : parseDefaultValue(defValStr, scope));
        } else {
          const val = Object.prototype.hasOwnProperty.call(safeObj, entry) ? (safeObj as any)[entry] : undefined;
          safeSetScopeProp(scope, entry, val);
        }
      }
    }
  } else if (itemName.startsWith('[') && itemName.endsWith(']')) {
    const arr = resolveIterable(itemVal);
    const entries = splitPatternEntries(itemName.slice(1, -1));
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const eqIdx = findTopLevelChar(entry, '=');
      if (eqIdx !== -1) {
        const varName = entry.slice(0, eqIdx).trim();
        const defValStr = entry.slice(eqIdx + 1).trim();
        const val = arr[i];
        safeSetScopeProp(scope, varName, val !== undefined ? val : parseDefaultValue(defValStr, scope));
      } else if (entry.startsWith('{') || entry.startsWith('[')) {
        populateItemScope(scope, entry, arr[i], null, 0);
      } else {
        safeSetScopeProp(scope, entry, arr[i]);
      }
    }
  }
}

function parseDefaultValue(defStr: string, scope?: Record<string, any>): any {
  const trimmed = defStr.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`'))
  ) {
    return trimmed.slice(1, -1);
  }
  if (!Number.isNaN(Number(trimmed)) && trimmed !== '') {
    return Number(trimmed);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    if (scope && inScopeChain(scope, trimmed)) {
      return getScopeValue(scope, trimmed);
    }
    return trimmed;
  }
}

/**
 * Populates scope for @async resolution, supporting identifier and destructuring patterns.
 */
export function populateAsyncScope(
  scope: Record<string, any>,
  aliasName: string,
  resolvedVal: any
): void {
  populateItemScope(scope, aliasName, resolvedVal, null, 0);
}


